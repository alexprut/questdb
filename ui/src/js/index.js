import "./console"
import Worker from "./telemetry/worklet"

const worker = new Worker()

worker.onmessage = (event) => {
  console.log("received: " + event.data)
}
worker.postMessage(42)
