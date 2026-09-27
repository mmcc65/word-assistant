# HarmonyOS HAP shell

This DevEco Studio project wraps the same responsive web application in ArkWeb.

Before opening the project, run `pnpm harmony:sync` from the repository root. Open
this directory in a current DevEco Studio installation, let DevEco update project
metadata if requested, configure automatic signing, and build the `entry` module.

The project can produce an unsigned HAP with DevEco Studio and a matching HarmonyOS
SDK. The source path must contain only supported ASCII characters; stage the project
in an ASCII-only path before invoking Hvigor if necessary. An unsigned HAP is a
development artifact and cannot be installed on a tablet. Installation requires a
valid signing configuration and device authorization; neither is bundled in this
repository.
