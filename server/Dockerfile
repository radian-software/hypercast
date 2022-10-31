# EOL: April 2027
FROM ubuntu:22.04

RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*
RUN curl -sL https://deb.nodesource.com/setup_16.x | bash && rm -rf /var/lib/apt/lists/*
RUN apt-get update && apt-get install -y nodejs tini && rm -rf /var/lib/apt/lists/*

WORKDIR /src
COPY package.json package-lock.json /src/
RUN npm ci

COPY server.js /src/
ENTRYPOINT ["/usr/bin/tini", "--"]
ENV HOST=0.0.0.0
CMD ["node", "server.js"]
EXPOSE 8080
