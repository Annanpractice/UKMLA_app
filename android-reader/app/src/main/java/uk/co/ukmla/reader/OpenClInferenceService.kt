package uk.co.ukmla.reader

import android.app.Service
import android.content.Intent
import android.os.*
import java.util.concurrent.Executors

class OpenClInferenceService : Service() {
    companion object {
        const val GENERATE=1
        const val CANCEL=2
        const val RESULT=3
        const val ERROR=4
    }

    private val worker=Executors.newSingleThreadExecutor()
    private var libraryLoaded=false
    private var loadedPath:String?=null

    private fun ensureLibrary() {
        if(!libraryLoaded) {
            System.loadLibrary("reader_opencl")
            libraryLoaded=true
        }
    }

    private val messenger=Messenger(Handler(Looper.getMainLooper()) { msg ->
        when(msg.what) {
            CANCEL -> {
                if(libraryLoaded) runCatching { OpenClNative.cancel() }
                true
            }
            GENERATE -> {
                val reply=msg.replyTo
                val path=msg.data.getString("path").orEmpty()
                val prompt=msg.data.getString("prompt").orEmpty()
                worker.execute {
                    try {
                        ensureLibrary()
                        if(loadedPath!=path) {
                            OpenClNative.load(path)
                            loadedPath=path
                        }
                        val bytes=OpenClNative.generate(prompt)
                        reply.send(Message.obtain(null,RESULT).apply {
                            data=Bundle().apply { putByteArray("result",bytes) }
                        })
                    } catch(t:Throwable) {
                        runCatching {
                            reply.send(Message.obtain(null,ERROR).apply {
                                data=Bundle().apply { putString("error",t.message ?: t.javaClass.simpleName) }
                            })
                        }
                    }
                }
                true
            }
            else -> false
        }
    })

    override fun onBind(intent:Intent)=messenger.binder
    override fun onDestroy() {
        if(libraryLoaded) runCatching { OpenClNative.cancel() }
        worker.shutdownNow()
        super.onDestroy()
    }
}
