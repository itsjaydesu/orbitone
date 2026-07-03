type TransportTimeReader = () => number

let reader: TransportTimeReader | null = null

export function setTransportTimeReader(nextReader: TransportTimeReader | null) {
  reader = nextReader
}

export function readTransportSeconds() {
  return reader ? reader() : 0
}
