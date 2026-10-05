import 'dart:io' show Platform;
import 'package:flutter/foundation.dart';

/// Server address. Override at build time:
///
///   flutter run   --dart-define=SERVER_URL=http://192.168.1.5:3000
///   flutter build --dart-define=SERVER_URL=https://your-backend.onrender.com
///
/// Defaults:
///   Web        → http://localhost:3000
///   Android    → http://10.0.2.2:3000 (emulator) — override for physical device
///   iOS        → http://localhost:3000 (simulator)
///   Release    → must be overridden via --dart-define=SERVER_URL=https://...
const String _override = String.fromEnvironment('SERVER_URL');

String get serverUrl {
  if (_override.isNotEmpty) return _override;

  // In release mode there is no sensible localhost default.
  // Return a placeholder that will fail visibly so it's obvious
  // the build needs SERVER_URL.
  if (kReleaseMode) {
    return const String.fromEnvironment('SERVER_URL',
        defaultValue: 'https://SET-YOUR-SERVER-URL.example.com');
  }

  if (kIsWeb) return 'http://localhost:3000';

  // Android emulator reaches the host machine through 10.0.2.2
  if (!kIsWeb && Platform.isAndroid) return 'http://10.0.2.2:3000';

  // iOS simulator / desktop
  return 'http://localhost:3000';
}
