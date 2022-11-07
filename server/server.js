"use strict";

import process from "process";

import express from "express";
import { tinyws } from "tinyws";

const app = express();

app.use(tinyws());

app.get("/", async (_req, res) => {
  res.send("hello this server is not meant to be accessed in a browser");
});

const sessions = {};

app.use("/ws", async (req, res) => {
  try {
    if (!req.ws) {
      res.status(400).send("received plain http request to websocket endpoint");
      return;
    }
    // Validate the access token. For some reason you can't pass http
    // headers to websockets from javascript [1], so instead you have
    // to do some weird thing where the client requests a one time
    // code from the server that is then passed as a query parameter,
    // or something. I don't feel like building that so for now we
    // just put the access token in the query parameters as well. It
    // should be not that big of a deal.
    //
    // [1]: https://stackoverflow.com/a/4361358
    if (process.env.AUTH_TOKEN && req.query.token !== process.env.AUTH_TOKEN) {
      res
        .status(401)
        .send("received request without correct authorization token");
      return;
    }
    if (!req.query.session) {
      res.status(422).send("received connection request without session name");
      return;
    }
    if (req.query.session.length > 1024) {
      res.status(422).send("session name is too long");
      return;
    }
    if (!req.query.client) {
      res.status(422).send("received connection request without client name");
      return;
    }
    if (req.query.client.length > 1024) {
      res.status(422).send("client name is too long");
    }
    // Look up existing session or create a new one.
    const session = sessions[req.query.session] || {
      conns: [],
    };
    sessions[req.query.session] = session;
    // Get websocket object from the request.
    const ws = await req.ws();
    ws.on("close", () => {
      // Remove current connection from list of active connections in
      // the session so we do not try to broadcast to it.
      session.conns = session.conns.filter((conn) => conn !== ws);
      // If no clients connected any longer, delete session.
      if (session.conns.length === 0) {
        delete sessions[req.query.session];
      }
    });
    ws.on("message", (msg) => {
      const logPrefix = `msg [client ${req.query.client} => session ${req.query.session}]`;
      // Put an upper limit on messages, for sanity.
      if (msg.length > 4096) {
        console.log(
          `${logPrefix} discarded due to excessive length of ${msg.length}`
        );
        return;
      }
      // For debugging, log all messages.
      console.log(`${logPrefix} ${msg}`);
      // Broadcast received message to all other connected clients.
      for (const conn of session.conns) {
        // Don't echo message back to the client that sent it.
        if (conn === ws) {
          continue;
        }
        conn.send(msg);
      }
    });
    session.conns.push(ws);
  } catch (err) {
    console.error(err);
    res.status(500).send("unexpected error");
  }
});

const listenPort = parseInt(process.env.PORT) || 8080;
const listenHost = process.env.HOST || "127.0.0.1";

app.listen(listenPort, listenHost, () => {
  console.log(`Listening on http://${listenHost}:${listenPort}`);
});
