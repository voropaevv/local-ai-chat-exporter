import { render } from "preact";

import { PreviewApp } from "../../src/ui/PreviewApp";
import "../../src/ui/styles.css";

const root = document.getElementById("app");

if (root) {
  render(<PreviewApp />, root);
}
