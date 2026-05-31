import { render } from "preact";

import { PopupApp } from "../../src/ui/PopupApp";
import "../../src/ui/styles.css";

const root = document.getElementById("app");

if (root) {
  render(<PopupApp />, root);
}
