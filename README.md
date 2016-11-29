# chat-service-ws-messaging

[![NPM Version](https://badge.fury.io/js/chat-service-ws-messaging.svg)](https://badge.fury.io/js/chat-service-ws-messaging)
[![JavaScript Style Guide](https://img.shields.io/badge/code%20style-standard-brightgreen.svg)](http://standardjs.com/)

> chat-service ws-messaging transport plugin

## Table of Contents

- [Installation](#installation)
- [Usage](#usage)
- [Contribute](#contribute)
- [License](#license)

## Installation

```sh
npm i chat-service
npm i chat-service-ws-messaging
```

## Usage

On a server:

```javascript
const ChatService = require('chat-service')
const transport = require('chat-service-ws-messaging')

const port = 8000

const service = new ChatService({ port, transport }, { onConnect })
```

On a client just [ws-messaging](https://github.com/an-sh/ws-messaging)
client is required.

## Contribute

If you encounter a bug in this package, please submit a bug report to
github repo
[issues](https://github.com/an-sh/chat-service-ws-messaging/issues).

PRs are also accepted.

## License

MIT
