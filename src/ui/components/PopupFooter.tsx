import {
  LOGTHREAD_GITHUB_URL,
  LOGTHREAD_PRIVACY_URL,
  LOGTHREAD_SPONSORS_URL
} from "../support-links";

export function PopupFooter() {
  return (
    <footer className="popup-footer">
      <a href={LOGTHREAD_GITHUB_URL} target="_blank" rel="noreferrer">
        GitHub
      </a>
      <a href={LOGTHREAD_SPONSORS_URL} target="_blank" rel="noreferrer">
        Sponsors
      </a>
      <a href={LOGTHREAD_PRIVACY_URL} target="_blank" rel="noreferrer">
        Privacy
      </a>
      <span>Not affiliated with AI chat providers.</span>
    </footer>
  );
}
