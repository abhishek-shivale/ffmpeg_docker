FROM ubuntu:focal

RUN apt-get update && \
    apt-get install -y curl && \
    curl -sL https://deb.nodesource.com/setup_22.x | bash - && \
    apt-get update && \
    apt-get install -y nodejs ffmpeg && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /home/app

COPY package.json pnpm-lock.yaml* ./

RUN npm install -g corepack && \
    corepack enable pnpm && \
    pnpm install

COPY . .

RUN mkdir -p ./input

ENV VIDEO_URL=""

CMD ["node", "start.js"]