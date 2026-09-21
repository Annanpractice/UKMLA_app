package uk.co.ukmla.reader

object OpenClNative {
    external fun load(path: String)
    external fun generate(prompt: String): ByteArray
    external fun cancel()
}
