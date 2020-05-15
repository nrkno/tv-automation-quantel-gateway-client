# Sofie: The Modern TV News Studio Automation System (Quantel gateway client)

This is a part of the [**Sofie** TV News Studio Automation System](https://github.com/nrkno/Sofie-TV-automation/).

## Abstract

A client-side library for the [Sofie Quantel Gateway](https://github.com/nrkno/tv-automation-quantel-gateway).

## Usage

### Pre-requisites

- A Quantel ISA SQ system and the IP address or DNS name of the ISA manager(s).
- An installed and running Quantel Gateway, with IP address and port number.

### Installing for your application

Use `npm` or `yarn` to install the package. As a typescript project, type definiitons are
included. One of:

    npm install quantel-gateway-client
    yarn add quantel-gateway-client

### Using in an application

Create a Quantel Gateway Client instance and initialize it to connect to to the gateway.

```javascript
import { QuantelGateway, Q } from 'quantel-gateway-client'

const quantelClient = new QuantelGateway()
await quantelCient.init(
	'quantel.gateway.url:port',
	'quantel.isa.url',
	undefined,
	'default',
	serverID
)
```

If the serverID is not known, before calling `init()` request the details of all servers:

```javascript
await quantelClient.connectToISA('quantel.isa.url')
const servers = await quantelClient.getServers('default')
```

Then initialize the client as above.

Once finished with the class, call `dispose()`.

### Documentation

The library is self-documenting using TypeDoc annotations. Details of the REST API
that this library is a client for can be found in the [Quantel Gateway documentation](https://github.com/nrkno/tv-automation-quantel-gateway#http-api).

## License

[MIT](./LICENSE).

---

_The NRK logo is a registered trademark of Norsk rikskringkasting AS. The license does not grant any right to use, in any way, any trademarks, service marks or logos of Norsk rikskringkasting AS._
