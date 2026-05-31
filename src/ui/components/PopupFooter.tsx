const GITHUB_URL = ["https:", "", "github.com", "voropaevv", "local-ai-chat-exporter"].join("/");

export function PopupFooter() {
  return (
    <footer className="popup-footer">
      <a href={GITHUB_URL} target="_blank" rel="noreferrer">
        GitHub
      </a>
      <a href="#privacy">Privacy</a>
      <span>Not affiliated with AI chat providers.</span>
    </footer>
  );
}
