package uk.co.ukmla.gputester
import android.content.*
import android.os.*
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Test
import org.junit.Assert.*
import org.junit.runner.RunWith
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
@RunWith(AndroidJUnit4::class)
class IsolationTest {
 @Test fun workerDeathDoesNotKillInterface() {
  val i=InstrumentationRegistry.getInstrumentation();val context=i.targetContext
  val activity=i.startActivitySync(Intent(context,MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
  val died=CountDownLatch(1)
  val conn=object:ServiceConnection {
   override fun onServiceConnected(name:ComponentName,binder:IBinder) {
    binder.linkToDeath({died.countDown()},0)
    Messenger(binder).send(Message.obtain(null,2))
   }
   override fun onServiceDisconnected(name:ComponentName) {}
  }
  assertTrue(context.bindService(Intent(context,ProbeService::class.java),conn,Context.BIND_AUTO_CREATE))
  try { assertTrue("worker must terminate independently",died.await(15,TimeUnit.SECONDS));i.waitForIdleSync();assertFalse(activity.isFinishing) }
  finally { context.unbindService(conn);i.runOnMainSync { activity.finish() } }
 }
 @Test fun offlineAndUnexportedWorker() {
  val c=InstrumentationRegistry.getInstrumentation().targetContext
  val info=c.packageManager.getPackageInfo(c.packageName,android.content.pm.PackageManager.GET_PERMISSIONS or android.content.pm.PackageManager.GET_SERVICES)
  assertFalse(info.requestedPermissions?.contains("android.permission.INTERNET") ?: false)
  val worker=info.services.orEmpty().first { it.name.endsWith("ProbeService") }
  assertFalse(worker.exported);assertTrue(worker.processName.endsWith(":probe"))
 }
}
