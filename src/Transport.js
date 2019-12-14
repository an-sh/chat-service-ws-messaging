'use strict'

const EmitterPubsubBroker = require('emitter-pubsub-broker')
const Promise = require('bluebird')
const Server = require('ws-messaging')
const assign = require('lodash.assign')
const { EventEmitter } = require('events')

function run (self, gen) {
  return Promise.coroutine(gen).call(self)
}

class ClusterBus extends EventEmitter {
  constructor (connector) {
    super()
    this.connector = connector
    this.channel = 'cluster:bus'
  }

  emit (ev, ...args) {
    this.connector.publish(this.channel, ev, ...args)
  }

  listen () {
    return this.connector.subscribe(this, this.channel)
  }
}

class Transport {
  constructor (server, options) {
    this.server = server
    this.options = options
    let { pubsubOptions = {}, wssOptions = {}, serverOptions = {}, socketOptions = {} } =
          options
    this.ChatServiceError = server.ChatServiceError

    // client-server commutation
    const connectionHook = this.connectionHook.bind(this)
    serverOptions = assign({}, serverOptions, { connectionHook })
    if (wssOptions.port == null && wssOptions.server == null) {
      wssOptions = assign({}, { port: this.server.port }, wssOptions)
    }
    this.messagesServer = new Server(wssOptions, serverOptions, socketOptions)

    // internal commutation
    const encoder = (args) => this.messagesServer.encodeMessage(...args)
    const method = 'sendEncoded'
    pubsubOptions = assign({}, pubsubOptions, { encoder, method })
    this.pubsub = new EmitterPubsubBroker(pubsubOptions)
    this.clusterBus = new ClusterBus(this.pubsub)

    this.closed = true
  }

  setEvents () {
    this.closed = false
  }

  integrateClient (socket, auth) {
    socket.data.auth = auth
    socket.on('close', () => this.pubsub.unsubscribeAll(socket))
  }

  connectionHook (socket, auth) {
    return run(this, function * () {
      const id = socket.id
      this.integrateClient(socket, auth)
      const [userName, authData = {}] = yield this.server.onConnect(id)
      if (!userName) {
        return Promise.reject(new this.ChatServiceError('noLogin'))
      }
      yield this.server.registerClient(userName, id)
      return Promise.resolve([userName, authData])
    })
  }

  close () {
    this.closed = true
    return Promise.resolve()
      .then(() => this.messagesServer.close())
      .then(() => this.pubsub.close())
  }

  bindHandler (id, name, fn) {
    const socket = this.getSocket(id)
    if (socket) {
      if (name === 'disconnect') {
        socket.on('close', fn)
      }
      socket.register(name, fn)
    }
  }

  getServer () {
    return this.messagesServer
  }

  getSocket (id) {
    return this.messagesServer.getClient(id)
  }

  emitToChannel (channel, eventName, ...eventData) {
    this.pubsub.publish(channel, eventName, ...eventData)
  }

  sendToChannel (id, channel, eventName, ...eventData) {
    const socket = this.getSocket(id)
    if (!socket) {
      this.pubsub.publish(channel, eventName, ...eventData)
    } else {
      this.pubsub.send(socket, channel, eventName, ...eventData)
    }
  }

  getHandshakeData (id) {
    const res = { isConnected: false, query: {}, headers: {}, auth: {} }
    const socket = this.getSocket(id)
    if (!socket) { return res }
    res.isConnected = true
    res.auth = socket.data.auth
    return res
  }

  joinChannel (id, channel) {
    const socket = this.getSocket(id)
    if (!socket) {
      return Promise.reject(new this.ChatServiceError('invalidSocket', id))
    } else {
      return this.pubsub.subscribe(socket, channel)
    }
  }

  leaveChannel (id, channel) {
    const socket = this.getSocket(id)
    if (!socket) { return Promise.resolve() }
    return this.pubsub.unsubscribe(socket, channel)
  }

  disconnectSocket (id) {
    const socket = this.getSocket(id)
    if (!socket) { return Promise.resolve() }
    return socket.close()
  }
}

module.exports = Transport
