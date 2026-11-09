/** Código da versão do app (versão · commit · data do build). */
export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';

export function VersionBadge({ className = '' }: { className?: string }) {
  return (
    <p className={`text-center text-[11px] text-on-surface-variant/70 select-text ${className}`} title="Versão do aplicativo">
      Magic Library {APP_VERSION}
    </p>
  );
}
