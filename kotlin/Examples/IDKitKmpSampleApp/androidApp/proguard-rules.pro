# JNA needs its native dispatch classes and the direct-mapped bridge intact.
-keep class com.sun.jna.** { *; }
-keep class com.worldcoin.idkit.multiplatform.internal.** { *; }
-dontwarn java.awt.*
