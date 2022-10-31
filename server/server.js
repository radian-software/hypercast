import process from "process";

import express from "express";
import { tinyws } from "tinyws";

const app = express();

app.use(tinyws());

app.get("/", async (_req, res) => {
  res.send("Hello world!");
});

app.use("/ws", async (req, res) => {
  if (!req.ws) {
    res.status(400).send("received plain http request to websocket endpoint");
    return;
  }
  const ws = await req.ws();
  return ws.send("hello from websocket");
});

const listenPort = parseInt(process.env.PORT) || 8080;
const listenHost = process.env.HOST || "127.0.0.1";

app.listen(listenPort, listenHost, () => {
  console.log(`Listening on http://${listenHost}:${listenPort}`);
});
