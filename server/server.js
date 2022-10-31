"use strict";

import process from "process";

import express from "express";
import { tinyws } from "tinyws";

const app = express();

app.use(tinyws());

app.get("/", async (_req, res) => {
  res.send("Hello world!");
});

const sessions = {};

app.use("/ws", async (req, res) => {
  try {
    if (!req.ws) {
      res.status(400).send("received plain http request to websocket endpoint");
      return;
    }
    // Validate that we received session name and client name as query
    // parameters and that they are not excessively long (prevent
    // unexpected things in code from being triggered by really long
    // identifiers).
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
