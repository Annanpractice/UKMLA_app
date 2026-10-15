package uk.co.ukmla.reader

import android.content.ComponentName
import android.content.Intent
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class OfflineSmokeTest {
    @Test fun bundledCardsAndGlossaryRetrieveWithoutNetwork() {
        val context=InstrumentationRegistry.getInstrumentation().targetContext
        val store=CardStore(context)
        try {
            assertEquals(983,store.browse().size)
            val ataxia=store.search("ataxia")
            assertEquals("ataxia",ataxia.first().title.lowercase())
            assertEquals("glossary",ataxia.first().kind)
            assertTrue(ataxia.first().body.contains("coordination"))
            assertTrue(store.search("heart failure").any { it.kind=="card" })
            assertTrue(store.search("zzxxyyqnomatch").isEmpty())
            assertTrue(store.search("\" OR * ( )").isEmpty())
        } finally { store.close() }
        val permissions=context.packageManager.getPackageInfo(context.packageName,4096).requestedPermissions?.toList() ?: emptyList()
        assertFalse(permissions.contains("android.permission.INTERNET"))
    }
    @Test fun jniLoadsAndReportsMissingModel() {
        Native.cancel()
        try { Native.load("/no-such-model.gguf");fail("Missing model must fail") }
        catch(expected:IllegalStateException) { assertFalse(expected.message.isNullOrBlank()) }
    }
    @Test fun backgroundInferenceServiceIsDeclared() {
        val context=InstrumentationRegistry.getInstrumentation().targetContext
        val info=context.packageManager.getServiceInfo(ComponentName(context,BackgroundInferenceService::class.java),0)
        assertFalse(info.exported)
        val permissions=context.packageManager.getPackageInfo(context.packageName,4096).requestedPermissions?.toList() ?: emptyList()
        assertTrue(permissions.contains("android.permission.FOREGROUND_SERVICE"))
        assertTrue(permissions.contains("android.permission.FOREGROUND_SERVICE_SPECIAL_USE"))
        assertFalse(permissions.contains("android.permission.INTERNET"))
    }
    @Test fun launchesNativeReaderAndExternalSelection() {
        val i=InstrumentationRegistry.getInstrumentation()
        val activity=i.startActivitySync(Intent(i.targetContext,MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK).putExtra(Intent.EXTRA_PROCESS_TEXT,"ataxia"))
        i.waitForIdleSync()
        assertFalse(activity.isFinishing)
        i.runOnMainSync { activity.finish() }
    }
}
