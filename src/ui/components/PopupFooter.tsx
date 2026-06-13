import {
  JELLUVI_GITHUB_URL,
  JELLUVI_PRIVACY_URL,
  JELLUVI_SPONSORS_URL
} from "../support-links";

export function PopupFooter() {
  return (
    <footer className="popup-footer">
      <a href={JELLUVI_GITHUB_URL} target="_blank" rel="noreferrer">
        GitHub
      </a>
      <a href={JELLUVI_SPONSORS_URL} target="_blank" rel="noreferrer">
        Sponsors
      </a>
      <a href={JELLUVI_PRIVACY_URL} target="_blank" rel="noreferrer">
        Privacy
      </a>
    </footer>
  );
}
