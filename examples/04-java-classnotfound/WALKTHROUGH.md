# Example 4 — Java ClassNotFoundException

## What you'll see

```
$ javac App.java && java App
loading driver...
Exception in thread "main" java.lang.ClassNotFoundException: com.example.MissingDriver
        at java.base/jdk.internal.loader.BuiltinClassLoader.loadClass(BuiltinClassLoader.java:641)
        at java.base/jdk.internal.loader.ClassLoaders$AppClassLoader.loadClass(ClassLoaders.java:188)
        at java.base/java.lang.ClassLoader.loadClass(ClassLoader.java:520)
        at java.base/java.lang.Class.forName0(Native Method)
        at java.base/java.lang.Class.forName(Class.java:467)
        at App.main(App.java:13)
```

A classic JVM packaging failure. Real-world version: a JDBC driver declared `<scope>test</scope>` in Maven, missing from the production fat-JAR; or a Gradle `compileOnly` dependency that should have been `implementation`.

## Capture

```bash
bugproof capture -n classnotfound -- ./reproduce.sh
```

What BugProof records:

1. **JDK version** (e.g. `java: 17.0.9, OpenJDK 64-Bit`)
2. **The fully-qualified class name** as part of the error pattern (`com.example.MissingDriver`)
3. **The whole stack trace** — every frame, not just the top
4. **`App.java`** but not `App.class` (build artifacts are excluded by default)

## Replay

```bash
bugproof replay classnotfound.bug
```

Replay re-runs `javac` then `java` from scratch. Verdict: **REPRODUCTION CONFIRMED** — same `ClassNotFoundException` for the same class.

## Why this is hard to reproduce by description alone

A `ClassNotFoundException` description normally goes:

> "I get a ClassNotFoundException for some driver"

Then comes 30 minutes of:

- Which Java version?
- Which classpath?
- Which Maven/Gradle config?
- Did you do a clean build?
- What's the full stack?

A `.bug` artifact answers all of those in one file.

## What this example proves

- Java/JVM error patterns are first-class — `Exception` and `Error` suffixes are core fingerprint tokens
- The stacktrace source-strategy works on Java too (only `App.java` is bundled, even though the failure mentions ten JDK frames)
- BugProof's verdict engine treats `java.lang.ClassNotFoundException` and `com.example.MissingDriver` as both *expected* parts of the failure — a missing class with a *different* name would correctly fail to confirm

## Tip: signing for distribution

JVM bugs are often shared with vendors or upstream maintainers. Sign the artifact so the receiver can verify it hasn't been tampered with:

```bash
bugproof keygen
bugproof capture --sign --signer "alice@team.com" -n classnotfound -- ./reproduce.sh
bugproof verify classnotfound.bug
```
