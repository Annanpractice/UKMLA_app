package uk.co.ukmla.reader

import android.content.*
import android.os.*

class OpenClClient(private val context:Context) {
    private var service:Messenger?=null
    private var connection:ServiceConnection?=null
    private var bound=false
    private var pending:Pending?=null

    private data class Pending(
        val path:String,
        val prompt:String,
        val result:(ByteArray)->Unit,
        val fallback:(String)->Unit
    )

    private val reply=Messenger(Handler(Looper.getMainLooper()) { msg ->
        val current=pending ?: return@Handler true
        when(msg.what) {
            OpenClInferenceService.RESULT -> {
                pending=null
                current.result(msg.data.getByteArray("result") ?: ByteArray(0))
            }
            OpenClInferenceService.ERROR -> {
                pending=null
                current.fallback(msg.data.getString("error") ?: "OpenCL worker error")
            }
        }
        true
    })

    fun generate(path:String,prompt:String,result:(ByteArray)->Unit,fallback:(String)->Unit) {
        pending=Pending(path,prompt,result,fallback)
        if(service!=null) {
            send()
            return
        }
        if(bound) return

        val conn=object:ServiceConnection {
            override fun onServiceConnected(name:ComponentName,binder:IBinder) {
                service=Messenger(binder)
                send()
            }
            override fun onServiceDisconnected(name:ComponentName) {
                service=null
                bound=false
                val current=pending
                pending=null
                if(current!=null) current.fallback("OpenCL worker exited")
            }
            override fun onBindingDied(name:ComponentName) {
                service=null
                bound=false
                val current=pending
                pending=null
                if(current!=null) current.fallback("OpenCL worker binding died")
            }
        }
        connection=conn
        bound=context.bindService(Intent(context,OpenClInferenceService::class.java),conn,Context.BIND_AUTO_CREATE)
        if(!bound) {
            connection=null
            val current=pending
            pending=null
            current?.fallback("OpenCL worker could not start")
        }
    }

    private fun send() {
        val current=pending ?: return
        try {
            service?.send(Message.obtain(null,OpenClInferenceService.GENERATE).apply {
                replyTo=reply
                data=Bundle().apply {
                    putString("path",current.path)
                    putString("prompt",current.prompt)
                }
            })
        } catch(e:Exception) {
            pending=null
            current.fallback(e.message ?: "OpenCL worker unavailable")
        }
    }

    fun cancel() {
        runCatching { service?.send(Message.obtain(null,OpenClInferenceService.CANCEL)) }
    }

    fun close() {
        if(bound) connection?.let { runCatching { context.unbindService(it) } }
        service=null
        connection=null
        bound=false
        pending=null
    }
}
