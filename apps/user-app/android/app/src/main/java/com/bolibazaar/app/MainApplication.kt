package com.bolibazaar.app

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.hotupdater.HotUpdater

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          add(VoicePackage()) // voice search (BBVoice)
        },
      // Release builds start the newest over-the-air update downloaded by Hot Updater (or the code inside the APK
      // when there is none); debug builds load from Metro.
      jsBundleFilePath = if (BuildConfig.DEBUG) null else HotUpdater.getJSBundleFile(applicationContext),
    )
  }

  override fun onCreate() {
    super.onCreate()
    loadReactNative(this)
  }
}
