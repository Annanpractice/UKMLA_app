package uk.co.ukmla.reader
object Native {
    init { System.loadLibrary("reader") }
    external fun load(path: String)
    external fun generate(prompt: String): ByteArray
    external fun cancel()
}
