/**
 * Mensagens prontas do chat de troca de livros.
 *
 * O chat NÃO aceita texto livre: o aluno escolhe uma frase e o app grava só o
 * `presetId`. O texto exibido vem daqui. As regras do Firestore (firestore.rules)
 * aceitam apenas os ids desta lista — se adicionar ou remover um id, atualize
 * também a lista `presetIds` em firestore.rules.
 */

export interface ChatPreset {
  id: string;
  text: string;
  group: 'combinar' | 'resposta' | 'entrega' | 'agradecer';
}

export const CHAT_PRESET_GROUPS: Record<ChatPreset['group'], string> = {
  combinar: 'Combinar',
  resposta: 'Responder',
  entrega: 'Entrega e devolução',
  agradecer: 'Agradecer',
};

export const CHAT_PRESETS: ChatPreset[] = [
  { id: 'oi', group: 'combinar', text: 'Oi! Tudo bem? 👋' },
  { id: 'posso_pegar', group: 'combinar', text: 'Posso pegar esse livro emprestado? 📖' },
  { id: 'quando', group: 'combinar', text: 'Quando podemos fazer a troca? 🗓️' },
  { id: 'amanha_escola', group: 'combinar', text: 'Pode ser amanhã, na escola? 🏫' },

  { id: 'pode_sim', group: 'resposta', text: 'Pode sim! Vamos combinar a entrega. 🤝' },
  { id: 'ainda_lendo', group: 'resposta', text: 'Ainda estou lendo, aviso quando terminar! ⏳' },
  { id: 'combinado', group: 'resposta', text: 'Combinado! 👍' },
  { id: 'outro_dia', group: 'resposta', text: 'Pode ser outro dia? 🙏' },

  { id: 'recebi', group: 'entrega', text: 'Recebi o livro! 📚' },
  { id: 'vou_cuidar', group: 'entrega', text: 'Vou cuidar bem dele! ✨' },
  { id: 'mais_dias', group: 'entrega', text: 'Preciso de mais uns dias para terminar. ⏰' },
  { id: 'devolvi', group: 'entrega', text: 'Já devolvi o livro. 🤝' },

  { id: 'obrigado', group: 'agradecer', text: 'Muito obrigado(a)! 😊' },
  { id: 'adorei', group: 'agradecer', text: 'Adorei o livro! 🤩' },
  { id: 'indicar', group: 'agradecer', text: 'Vou indicar para outros colegas! 🎉' },
];

export const CHAT_PRESET_BY_ID: Record<string, ChatPreset> = Object.fromEntries(
  CHAT_PRESETS.map(p => [p.id, p])
);

/** Mensagens automáticas do sistema (também sem texto livre). */
export type SystemMessageKind =
  | 'loan_request' | 'chat_opened' | 'loan_accepted' | 'loan_declined' | 'loan_cancelled' | 'loan_completed';

export function systemMessageText(
  kind: string,
  ex: { initiatorName?: string; receiverName?: string; bookTitle?: string }
): string {
  switch (kind) {
    case 'loan_request':
      return `✨ @${ex.initiatorName} pediu emprestado o livro "${ex.bookTitle}" de @${ex.receiverName}. Agora é esperar @${ex.receiverName} aceitar o pedido! ⏳`;
    case 'loan_accepted':
      return `✅ @${ex.receiverName} aceitou emprestar "${ex.bookTitle}"! Use as mensagens prontas para combinar a entrega. 📖🤝`;
    case 'loan_declined':
      return `🙏 O pedido de "${ex.bookTitle}" não foi aceito desta vez. Você pode pedir outro livro!`;
    case 'loan_cancelled':
      return `↩️ @${ex.initiatorName} cancelou o pedido de "${ex.bookTitle}".`;
    case 'loan_completed':
      return `🎉 "${ex.bookTitle}" voltou para @${ex.receiverName}. Empréstimo concluído!`;
    case 'chat_opened':
      return `✨ Troca aberta para o livro "${ex.bookTitle}". Use as mensagens prontas abaixo para combinar! 📖🤝`;
    default:
      return '';
  }
}
