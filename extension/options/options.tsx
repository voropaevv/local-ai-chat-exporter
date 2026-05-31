import { render } from "preact";

import { OptionsApp } from "../../src/ui/OptionsApp";
import "../../src/ui/styles.css";

const root = document.getElementById("app");

if (root) {
  render(<OptionsApp />, root);
}
