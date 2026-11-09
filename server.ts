import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import { MercadoPagoConfig, Preference } from "mercadopago";
import dotenv from "dotenv";
import fs from "fs";
import { createRemoteJWKSet, jwtVerify } from "jose";

// If we are running from the dist folder, or NODE_ENV is production, load .env.production
const isDist = typeof __dirname !== 'undefined' && __dirname.includes('dist');
if (process.env.NODE_ENV === "production" || isDist) {
  process.env.NODE_ENV = "production";
  if (fs.existsSync(".env.production")) {
    dotenv.config({ path: ".env.production" });
  }
}
dotenv.config(); // Fallback for standard .env


let mpClient: MercadoPagoConfig | null = null;
function getMP() {
  if (!mpClient) {
    const token = process.env.MERCADOPAGO_ACCESS_TOKEN || "APP_USR-dummy";
    mpClient = new MercadoPagoConfig({ accessToken: token });
  }
  return mpClient;
}
let aiClient: any = null;
function getAI() {
  if (!aiClient) {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY environment variable is missing. Please configure it.");
    }
    const apiKeyToUse = process.env.GEMINI_API_KEY || "";
    aiClient = new GoogleGenAI({
      apiKey: apiKeyToUse,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiClient;
}

// ---------------------------------------------------------------------------
// Autenticação (token de login do Firebase) e limite de uso por usuário
// ---------------------------------------------------------------------------
// ID público do projeto Firebase (o mesmo que vai no app); pode ser trocado por env.
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "gen-lang-client-0404948919";
// FIREBASE_JWKS_URL existe só para testes locais; em produção usa as chaves públicas do Google.
const firebaseJwks = createRemoteJWKSet(
  new URL(
    process.env.FIREBASE_JWKS_URL ||
      "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"
  )
);

async function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) {
    return res.status(401).json({ error: "Faça login para continuar." });
  }
  try {
    const { payload } = await jwtVerify(token, firebaseJwks, {
      issuer: `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`,
      audience: FIREBASE_PROJECT_ID,
    });
    if (!payload.sub) throw new Error("token sem sub");
    (req as any).uid = payload.sub;
    (req as any).userEmail = typeof payload.email === "string" ? payload.email : undefined;
    next();
  } catch {
    res.status(401).json({ error: "Sessão inválida. Entre novamente." });
  }
}

// Limite simples em memória, por usuário (o servidor roda em um único processo pm2).
function rateLimit(max: number, windowMs: number) {
  const hits = new Map<string, { count: number; reset: number }>();
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
  }, 10 * 60 * 1000).unref();

  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const uid = (req as any).uid as string;
    const now = Date.now();
    let entry = hits.get(uid);
    if (!entry || entry.reset <= now) {
      entry = { count: 0, reset: now + windowMs };
      hits.set(uid, entry);
    }
    if (entry.count >= max) {
      res.set("Retry-After", String(Math.ceil((entry.reset - now) / 1000)));
      return res.status(429).json({ error: "Limite de uso atingido. Tente novamente mais tarde." });
    }
    entry.count++;
    next();
  };
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const AVATAR_STYLES = ["bottts", "avataaars", "lorelei", "pixel-art", "micah"];

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3002;

  // Corpo pequeno por padrão; só a validação de avatar recebe imagem (até 2 MB).
  const smallJson = express.json({ limit: '100kb' });
  app.use((req, res, next) => (req.path.endsWith('/validate-avatar') ? next() : smallJson(req, res, next)));
  app.use(express.urlencoded({ limit: '100kb', extended: true }));

  // API routes
  const apiRouter = express.Router();
  const basePathForApi = process.env.VITE_BASE_PATH || '/';
  
  app.use("/api", apiRouter);
  app.use("/magic-library/api", apiRouter);
  app.use("/clientes/magic-library/api", apiRouter);
  if (basePathForApi !== '/') {
    app.use(basePathForApi + "api", apiRouter);
    if (!basePathForApi.endsWith('/')) {
       app.use(basePathForApi + "/api", apiRouter);
    }
  }

  apiRouter.post("/create-preference", requireAuth, rateLimit(10, HOUR), async (req, res) => {
    try {
      const { plan } = req.body;
      const userEmail = (req as any).userEmail; // do token de login, não do corpo
      let title = "";
      let price = 0;

      if (plan === "monthly") {
        title = "Magic Library - Plano Mensal";
        price = 18.00;
      } else if (plan === "annual") {
        title = "Magic Library - Plano Anual";
        price = 183.60;
      } else {
        return res.status(400).json({ error: "Plano inválido" });
      }

      const client = getMP();
      const preference = new Preference(client);
      
      const hostUrl = process.env.HOST_URL || (req.headers.origin || "http://localhost:5173");
      const basePath = process.env.VITE_BASE_PATH || '/';
      const returnUrl = hostUrl.endsWith('/') ? hostUrl.slice(0, -1) : hostUrl;

      const response = await preference.create({
        body: {
          items: [
            {
              id: plan,
              title: title,
              quantity: 1,
              unit_price: price,
              currency_id: "BRL"
            }
          ],
          payer: {
            email: userEmail
          },
          back_urls: {
            success: `${returnUrl}${basePath === '/' ? '' : basePath}subscription-success`,
            failure: `${returnUrl}${basePath === '/' ? '' : basePath}subscription`,
            pending: `${returnUrl}${basePath === '/' ? '' : basePath}subscription`
          },
          auto_return: "approved"
        }
      });

      res.json({ init_point: response.init_point });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: "Erro interno. Tente novamente." });
    }
  });

  apiRouter.get("/health", (req, res) => {
    res.json({ status: "ok" });
  });

  apiRouter.post("/search-book", requireAuth, rateLimit(10, DAY), async (req, res) => {
    try {
      const { query } = req.body;
      if (typeof query !== "string" || !query.trim() || query.length > 200) {
        return res.status(400).json({ error: "Busca inválida." });
      }

      const response = await getAI().models.generateContent({
        model: "gemini-2.5-flash",
        contents: `Encontre as informações reais sobre livros que correspondem à seguinte busca: "${query}". Retorne até 3 opções relevantes. Se não tiver certeza, responda o melhor possível.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            description: "Uma lista com até 3 opções de livros que correspondem à busca.",
            items: {
              type: Type.OBJECT,
              properties: {
                title: {
                  type: Type.STRING,
                  description: "O título completo do livro.",
                },
                author: {
                  type: Type.STRING,
                  description: "O nome completo do autor.",
                },
                publisher: {
                  type: Type.STRING,
                  description: "O nome da editora original ou principal do livro.",
                },
                edition: {
                  type: Type.STRING,
                  description: "Edição do livro, caso saiba (ex: 1ª Edição). Pode ser nulo se não houver.",
                },
                year: {
                  type: Type.INTEGER,
                  description: "O ano de publicação original do livro.",
                },
                pages: {
                  type: Type.INTEGER,
                  description: "O número aproximado de páginas do livro.",
                },
                synopsis: {
                  type: Type.STRING,
                  description: "Um breve resumo ou sinopse do livro.",
                },
                coverUrl: {
                  type: Type.STRING,
                  description: "URL de uma imagem de capa adequada para este livro (use uma foto bonita do Unsplash que represente o tema ou capa do livro, ex: https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c).",
                }
              },
              required: ["title", "author", "year", "pages"],
            }
          },
        },
      });

      const text = response.text;
      if (text) {
        res.json(JSON.parse(text));
      } else {
        res.status(500).json({ error: "Erro ao gerar as informações do livro." });
      }
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: "Erro interno. Tente novamente." });
    }
  });

  apiRouter.post("/validate-avatar", requireAuth, rateLimit(10, DAY), express.json({ limit: '2mb' }), async (req, res) => {
    try {
      const { imageBase64, mimeType } = req.body;
      const allowedMime = ["image/jpeg", "image/png", "image/webp", "image/gif"];
      if (typeof imageBase64 !== "string" || !imageBase64 || imageBase64.length > 1_900_000) {
        return res.status(400).json({ error: "Imagem inválida ou grande demais." });
      }
      if (mimeType && !allowedMime.includes(mimeType)) {
        return res.status(400).json({ error: "Tipo de imagem não permitido." });
      }

      const response = await getAI().models.generateContent({
        model: "gemini-2.5-flash",
        contents: [
          {
            inlineData: {
              mimeType: mimeType || "image/jpeg",
              data: imageBase64
            }
          },
          "Analise esta imagem enviada pelo usuário para uso como avatar. Verifique se ela é uma fotografia real de pessoa humana (selfie, retrato fotográfico real). O sistema proíbe fotos reais para manter a privacidade e o tema mágico/ilustrado. Retorne um JSON estrito: { isRealPhoto: boolean, reason: string }."
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              isRealPhoto: { type: Type.BOOLEAN },
              reason: { type: Type.STRING }
            },
            required: ["isRealPhoto", "reason"]
          }
        }
      });

      const text = response.text;
      if (text) {
        res.json(JSON.parse(text));
      } else {
        // Sem resposta da análise: não aprovar a imagem
        res.status(502).json({ error: "Não foi possível analisar a imagem." });
      }
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: "Erro interno. Tente novamente." });
    }
  });

  apiRouter.post("/generate-gemini-avatar", requireAuth, rateLimit(10, DAY), async (req, res) => {
    try {
      const { prompt } = req.body;
      if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 200) {
        return res.status(400).json({ error: "Descrição inválida." });
      }

      const response = await getAI().models.generateContent({
        model: "gemini-2.5-flash",
        contents: `Com base na seguinte descrição de um personagem mágico: "${prompt}", crie um avatar ilustrado único. Escolha um estilo entre 'bottts', 'avataaars', 'lorelei', 'pixel-art', 'micah' e um seed ideal baseado no texto. Retorne um JSON com: { style: string, seed: string }`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              style: { type: Type.STRING },
              seed: { type: Type.STRING }
            },
            required: ["style", "seed"]
          }
        }
      });

      const text = response.text;
      if (text) {
        const parsed = JSON.parse(text);
        const style = AVATAR_STYLES.includes(parsed.style) ? parsed.style : 'bottts';
        const seed = String(parsed.seed || prompt).slice(0, 100);
        const avatarUrl = `https://api.dicebear.com/7.x/${style}/svg?seed=${encodeURIComponent(seed)}`;
        res.json({ avatarUrl, style, seed });
      } else {
        const avatarUrl = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(prompt)}`;
        res.json({ avatarUrl, style: 'bottts', seed: prompt });
      }
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: "Erro interno. Tente novamente." });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    const basePath = process.env.VITE_BASE_PATH || '/';
    
    // Serve files in dist from the basePath
    app.use(basePath, express.static(distPath));
    
    // Also serve from root in case Nginx strips the path when proxying
    if (basePath !== '/') {
      app.use('/', express.static(distPath));
    }
    
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
