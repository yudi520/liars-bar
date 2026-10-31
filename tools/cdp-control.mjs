// Simple CDP script using native WebSocket in Node 22
const pageId = process.argv[2];
const jsCode = process.argv[3];

if (!pageId || !jsCode) {
  console.error("Usage: node cdp-control.mjs <pageId> <jsCode>");
  process.exit(1);
}

const ws = new WebSocket(`ws://127.0.0.1:9222/devtools/page/${pageId}`);

ws.onopen = () => {
  const req = {
    id: 1,
    method: "Runtime.evaluate",
    params: {
      expression: jsCode,
      returnByValue: true
    }
  };
  ws.send(JSON.stringify(req));
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log("CDP Result:", JSON.stringify(data.result?.result?.value ?? data.result));
  ws.close();
  process.exit(0);
};

ws.onerror = (err) => {
  console.error("CDP WS Error:", err);
  process.exit(1);
};
