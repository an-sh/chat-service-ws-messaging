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
    let { connectorOptions = {}, wssOptions = {}, serverOptions = {}, socketOptions = {} } =
          options
    this.ChatServiceError = server.ChatServiceError
    let encoder = socketOptions.encoder || JSON.stringify
    let method = 'sendEncoded'
    connectorOptions = assign({}, connectorOptions, {encoder, method})
    this.connector = new EmitterPubsubBroker(connectorOptions)
    let connectionHook = this.connectionHook.bind(this)
    serverOptions = assign({}, serverOptions, {connectionHook})
    if (wssOptions.port == null && wssOptions.server == null) {
      wssOptions = assign({}, {port: this.server.port}, wssOptions)
    }
    this.messagesServer = new Server(wssOptions, serverOptions, socketOptions)
    this.clusterBus = new ClusterBus(this.connector)
    this.closed = true
  }

  setEvents () {
    this.closed = false
  }

  integrateClient (socket, auth) {
    socket.data.auth = auth
    socket.on('close', () => this.connector.unsubscribeAll(socket))
  }

  connectionHook (socket, auth) {
    return run(this, function * () {
      let id = socket.id
      this.integrateClient(socket, auth)
      let [userName, authData = {}] = yield this.server.onConnect(id)
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
      .then(() => this.connector.close())
  }

  bindHandler (id, name, fn) {
    let socket = this.getSocket(id)
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
    this.connector.publish(channel, eventName, ...eventData)
  }

  sendToChannel (id, channel, eventName, ...eventData) {
    let socket = this.getSocket(id)
    if (!socket) {
      this.connector.publish(channel, eventName, ...eventData)
    } else {
      this.connector.send(socket, channel, eventName, ...eventData)
    }
  }

  getHandshakeData (id) {
    let res = { isConnected: false, query: {}, headers: {}, auth: {} }
    let socket = this.getSocket(id)
    if (!socket) { return res }
    res.isConnected = true
    res.query = socket.socket.upgradeReq.query
    res.headers = socket.socket.upgradeReq.headers
    res.auth = socket.data.auth
    return res
  }

  joinChannel (id, channel) {
    let socket = this.getSocket(id)
    if (!socket) {
      return Promise.reject(new this.ChatServiceError('invalidSocket', id))
    } else {
      return this.connector.subscribe(socket, channel)
    }
  }

  leaveChannel (id, channel) {
    let socket = this.getSocket(id)
    if (!socket) { return Promise.resolve() }
    return this.connector.unsubscribe(socket, channel)
  }

  disconnectSocket (id) {
    let socket = this.getSocket(id)
    if (!socket) { return Promise.resolve() }
    return socket.close()
  }
}

module.exports = Transport
