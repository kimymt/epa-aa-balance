// グローバルフッター (v0.4.14)
//
// 配置: app/layout.tsx の <body> 末尾、{children} の後。
// `mt-auto` で常にビューポート最下部 (or コンテンツ下) に押し出す
// (body は flex flex-col + min-h-full なので機能する)。

// TODO(v0.4.x): Q&A の URL は後ほど確定。確定したら下記 QA_URL を更新する。
// 仮 URL は "#" にして、視覚的には存在を示すが押しても何も起きない状態。
const QA_URL = "#";
const QA_URL_PLACEHOLDER = QA_URL === "#";

const REPO_URL = "https://github.com/kimymt/epa-aa-balance";

export function Footer() {
  return (
    <footer className="mt-auto border-t border-slate-200 bg-white py-6 dark:border-slate-800 dark:bg-slate-900/50">
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-3 px-4 sm:flex-row sm:justify-between sm:gap-4 sm:px-6">
        <div className="text-xs text-slate-500 dark:text-slate-400">
          EPA/AAバランス
        </div>

        <nav
          aria-label="フッターリンク"
          className="flex flex-wrap items-center justify-center gap-4 text-sm"
        >
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
          >
            <GitHubIcon />
            GitHub
          </a>

          <a
            href={QA_URL}
            // QA URL 未確定の間は新規タブを開かない (#  だと history が汚れる)。
            // 確定後 QA_URL_PLACEHOLDER が false になり、target/rel が付与される。
            target={QA_URL_PLACEHOLDER ? undefined : "_blank"}
            rel={QA_URL_PLACEHOLDER ? undefined : "noopener noreferrer"}
            aria-disabled={QA_URL_PLACEHOLDER || undefined}
            className={
              QA_URL_PLACEHOLDER
                ? "inline-flex items-center gap-1.5 text-slate-400 cursor-not-allowed dark:text-slate-600"
                : "inline-flex items-center gap-1.5 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
            }
            title={QA_URL_PLACEHOLDER ? "Q&A ページは準備中です" : "Q&A を開く"}
          >
            <QAIcon />
            Q&amp;A{QA_URL_PLACEHOLDER && "（準備中）"}
          </a>
        </nav>
      </div>
    </footer>
  );
}

function GitHubIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className="shrink-0"
    >
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.387.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.4 3-.405 1.02.005 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  );
}

function QAIcon() {
  // 「？」マークの吹き出しアイコン (Q&A の意図が伝わるシンプルな形)
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      <path d="M9.5 9a2.5 2.5 0 1 1 5 0c0 1.5-2.5 2-2.5 4" />
      <path d="M12 17h.01" />
    </svg>
  );
}
