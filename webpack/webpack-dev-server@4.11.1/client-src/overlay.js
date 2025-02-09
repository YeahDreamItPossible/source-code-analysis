// 

import ansiHTML from "ansi-html-community";
import { encode } from "html-entities";

const colors = {
  reset: ["transparent", "transparent"],
  black: "181818",
  red: "E36049",
  green: "B3CB74",
  yellow: "FFD080",
  blue: "7CAFC2",
  magenta: "7FACCA",
  cyan: "C3C2EF",
  lightgrey: "EBE7E3",
  darkgrey: "6D7891",
};

/** @type {HTMLIFrameElement | null | undefined} */
let iframeContainerElement;
/** @type {HTMLDivElement | null | undefined} */
let containerElement;
/** @type {Array<(element: HTMLDivElement) => void>} */
let onLoadQueue = [];
/** @type {TrustedTypePolicy | undefined} */
let overlayTrustedTypesPolicy;

ansiHTML.setColors(colors);

/**
 * @param {string | null} trustedTypesPolicyName
 */
function createContainer(trustedTypesPolicyName) {
  // Enable Trusted Types if they are available in the current browser.
  if (window.trustedTypes) {
    overlayTrustedTypesPolicy = window.trustedTypes.createPolicy(
      trustedTypesPolicyName || "webpack-dev-server#overlay",
      {
        createHTML: (value) => value,
      }
    );
  }

  iframeContainerElement = document.createElement("iframe");
  iframeContainerElement.id = "webpack-dev-server-client-overlay";
  iframeContainerElement.src = "about:blank";
  iframeContainerElement.style.position = "fixed";
  iframeContainerElement.style.left = 0;
  iframeContainerElement.style.top = 0;
  iframeContainerElement.style.right = 0;
  iframeContainerElement.style.bottom = 0;
  iframeContainerElement.style.width = "100vw";
  iframeContainerElement.style.height = "100vh";
  iframeContainerElement.style.border = "none";
  iframeContainerElement.style.zIndex = 9999999999;
  iframeContainerElement.onload = () => {
    containerElement =
      /** @type {Document} */
      (
        /** @type {HTMLIFrameElement} */
        (iframeContainerElement).contentDocument
      ).createElement("div");
    containerElement.id = "webpack-dev-server-client-overlay-div";
    containerElement.style.position = "fixed";
    containerElement.style.boxSizing = "border-box";
    containerElement.style.left = 0;
    containerElement.style.top = 0;
    containerElement.style.right = 0;
    containerElement.style.bottom = 0;
    containerElement.style.width = "100vw";
    containerElement.style.height = "100vh";
    containerElement.style.backgroundColor = "rgba(0, 0, 0, 0.85)";
    containerElement.style.color = "#E8E8E8";
    containerElement.style.fontFamily = "Menlo, Consolas, monospace";
    containerElement.style.fontSize = "large";
    containerElement.style.padding = "2rem";
    containerElement.style.lineHeight = "1.2";
    containerElement.style.whiteSpace = "pre-wrap";
    containerElement.style.overflow = "auto";

    const headerElement = document.createElement("span");

    headerElement.innerText = "Compiled with problems:";

    const closeButtonElement = document.createElement("button");

    closeButtonElement.innerText = "X";
    closeButtonElement.style.background = "transparent";
    closeButtonElement.style.border = "none";
    closeButtonElement.style.fontSize = "20px";
    closeButtonElement.style.fontWeight = "bold";
    closeButtonElement.style.color = "white";
    closeButtonElement.style.cursor = "pointer";
    closeButtonElement.style.cssFloat = "right";
    // @ts-ignore
    closeButtonElement.style.styleFloat = "right";
    closeButtonElement.addEventListener("click", () => {
      hide();
    });

    containerElement.appendChild(headerElement);
    containerElement.appendChild(closeButtonElement);
    containerElement.appendChild(document.createElement("br"));
    containerElement.appendChild(document.createElement("br"));

    /** @type {Document} */
    (
      /** @type {HTMLIFrameElement} */
      (iframeContainerElement).contentDocument
    ).body.appendChild(containerElement);

    onLoadQueue.forEach((onLoad) => {
      onLoad(/** @type {HTMLDivElement} */ (containerElement));
    });
    onLoadQueue = [];

    /** @type {HTMLIFrameElement} */
    (iframeContainerElement).onload = null;
  };

  document.body.appendChild(iframeContainerElement);
}

/**
 * @param {(element: HTMLDivElement) => void} callback
 * @param {string | null} trustedTypesPolicyName
 */
function ensureOverlayExists(callback, trustedTypesPolicyName) {
  if (containerElement) {
    // Everything is ready, call the callback right away.
    callback(containerElement);

    return;
  }

  onLoadQueue.push(callback);

  if (iframeContainerElement) {
    return;
  }

  createContainer(trustedTypesPolicyName);
}

// Successful compilation.
function hide() {
  if (!iframeContainerElement) {
    return;
  }

  // Clean up and reset internal state.
  document.body.removeChild(iframeContainerElement);

  iframeContainerElement = null;
  containerElement = null;
}

/**
 * @param {string} type
 * @param {string  | { file?: string, moduleName?: string, loc?: string, message?: string }} item
 * @returns {{ header: string, body: string }}
 */
function formatProblem(type, item) {
  let header = type === "warning" ? "WARNING" : "ERROR";
  let body = "";

  if (typeof item === "string") {
    body += item;
  } else {
    const file = item.file || "";
    // eslint-disable-next-line no-nested-ternary
    const moduleName = item.moduleName
      ? item.moduleName.indexOf("!") !== -1
        ? `${item.moduleName.replace(/^(\s|\S)*!/, "")} (${item.moduleName})`
        : `${item.moduleName}`
      : "";
    const loc = item.loc;

    header += `${
      moduleName || file
        ? ` in ${
            moduleName ? `${moduleName}${file ? ` (${file})` : ""}` : file
          }${loc ? ` ${loc}` : ""}`
        : ""
    }`;
    body += item.message || "";
  }

  return { header, body };
}

// Compilation with errors (e.g. syntax error or missing modules).
/**
 * @param {string} type
 * @param {Array<string  | { file?: string, moduleName?: string, loc?: string, message?: string }>} messages
 * @param {string | null} trustedTypesPolicyName
 */
function show(type, messages, trustedTypesPolicyName) {
  ensureOverlayExists(() => {
    messages.forEach((message) => {
      const entryElement = document.createElement("div");
      const typeElement = document.createElement("span");
      const { header, body } = formatProblem(type, message);

      typeElement.innerText = header;
      typeElement.style.color = `#${colors.red}`;

      // Make it look similar to our terminal.
      const text = ansiHTML(encode(body));
      const messageTextNode = document.createElement("div");

      messageTextNode.innerHTML = overlayTrustedTypesPolicy
        ? overlayTrustedTypesPolicy.createHTML(text)
        : text;

      entryElement.appendChild(typeElement);
      entryElement.appendChild(document.createElement("br"));
      entryElement.appendChild(document.createElement("br"));
      entryElement.appendChild(messageTextNode);
      entryElement.appendChild(document.createElement("br"));
      entryElement.appendChild(document.createElement("br"));

      /** @type {HTMLDivElement} */
      (containerElement).appendChild(entryElement);
    });
  }, trustedTypesPolicyName);
}

export { formatProblem, show, hide };
