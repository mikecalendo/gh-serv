FROM node:8-alpine

RUN apk --no-cache add git build-base libgit2-dev ca-certificates unzip wget

RUN ln -s /usr/lib/libcurl.so.4 /usr/lib/libcurl-gnutls.so.4
RUN ln -s /usr/lib/libcrypto.so /usr/lib/libcrypto.so.1.0.0
RUN ln -s /usr/lib/libssl.so /usr/lib/libssl.so.1.0.0

ENV APPUSER node:node
ENV GIT_ROOT /repositories

RUN mkdir /app && chown $APPUSER /app
RUN mkdir $GIT_ROOT && chown $APPUSER $GIT_ROOT

RUN update-ca-certificates

USER $APPUSER
WORKDIR /app

RUN git config --global user.email "admin@git-server"
RUN git config --global user.name "Git Server Admin"

#improves local build speed
COPY package.json .
COPY package-lock.json .
RUN npm install

COPY . .

ENV PORT 8000
EXPOSE $PORT
CMD ["npm", "start"]
