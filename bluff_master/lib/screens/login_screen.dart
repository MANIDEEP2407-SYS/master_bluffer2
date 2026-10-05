import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:google_sign_in/google_sign_in.dart';
import '../theme.dart';

final RegExp _emailRe = RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$');

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final FirebaseAuth _auth = FirebaseAuth.instance;
  // On Android, the client ID comes from google-services.json (no clientId needed).
  // On iOS/web, pass the appropriate clientId via GoogleSignIn(clientId: ...) or
  // set it in Info.plist / firebase_options.dart.
  final GoogleSignIn _googleAuth = GoogleSignIn(
    scopes: ['email'],
  );

  final _formKey = GlobalKey<FormState>();
  final _nameCtrl = TextEditingController();
  final _emailCtrl = TextEditingController();
  final _passCtrl = TextEditingController();

  bool _isRegister = false;
  bool _loading = false;
  bool _hidePass = true;
  String? _err;

  @override
  void dispose() {
    _nameCtrl.dispose();
    _emailCtrl.dispose();
    _passCtrl.dispose();
    super.dispose();
  }

  // Turns Firebase error codes into messages a player can understand.
  String _friendly(Object e) {
    if (e is FirebaseAuthException) {
      switch (e.code) {
        case 'invalid-email':
          return 'That email address is not valid.';
        case 'user-not-found':
        case 'wrong-password':
        case 'invalid-credential':
          return 'Wrong email or password.';
        case 'email-already-in-use':
          return 'An account with this email already exists. Try logging in.';
        case 'weak-password':
          return 'Password is too weak. Use at least 6 characters.';
        case 'user-disabled':
          return 'This account has been disabled.';
        case 'too-many-requests':
          return 'Too many attempts. Please wait a moment and try again.';
        case 'network-request-failed':
          return 'No internet connection.';
        case 'operation-not-allowed':
          return 'This sign-in method is not enabled in Firebase.';
      }
      return e.message ?? 'Authentication failed.';
    }
    return 'Something went wrong. Please try again.';
  }

  Future<void> _run(Future<void> Function() action) async {
    setState(() {
      _loading = true;
      _err = null;
    });
    try {
      await action();
      // AuthGate reacts to the new user and shows Home.
    } catch (e) {
      debugPrint('Auth error: $e');
      if (mounted) setState(() => _err = _friendly(e));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _submitEmail() {
    if (!_formKey.currentState!.validate()) return;
    final email = _emailCtrl.text.trim();
    final pass = _passCtrl.text;
    _run(() async {
      if (_isRegister) {
        final cred = await _auth.createUserWithEmailAndPassword(
            email: email, password: pass);
        await cred.user?.updateDisplayName(_nameCtrl.text.trim());
        await cred.user?.reload();
      } else {
        await _auth.signInWithEmailAndPassword(email: email, password: pass);
      }
    });
  }

  void _signInWithGoogle() {
    _run(() async {
      final googleUser = await _googleAuth.signIn();
      if (googleUser == null) return; // user cancelled
      final googleAuth = await googleUser.authentication;
      final credential = GoogleAuthProvider.credential(
        accessToken: googleAuth.accessToken,
        idToken: googleAuth.idToken,
      );
      await _auth.signInWithCredential(credential);
    });
  }

  void _signInAnonymously() => _run(() async {
        await _auth.signInAnonymously();
      });

  Future<void> _forgotPassword() async {
    final email = _emailCtrl.text.trim();
    if (!_emailRe.hasMatch(email)) {
      setState(() => _err = 'Enter your email above first, then tap Forgot password.');
      return;
    }
    await _run(() async {
      await _auth.sendPasswordResetEmail(email: email);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Password reset email sent to $email')));
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: ResponsiveBody(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Form(
              key: _formKey,
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const SizedBox(height: 16),
                  const Icon(Icons.theater_comedy, size: 80, color: kPrimary),
                  const SizedBox(height: 12),
                  Text(_isRegister ? 'Create Account' : 'Welcome Back!',
                      style: const TextStyle(
                          fontSize: 28,
                          fontWeight: FontWeight.bold,
                          color: Colors.white)),
                  const SizedBox(height: 4),
                  Text(
                      _isRegister
                          ? 'Register to start bluffing'
                          : 'Log in to continue',
                      style: const TextStyle(fontSize: 16, color: Colors.grey)),
                  const SizedBox(height: 24),
                  if (_err != null)
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(12),
                      margin: const EdgeInsets.only(bottom: 16),
                      decoration: BoxDecoration(
                        color: Colors.red.shade900.withValues(alpha: 0.4),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(_err!, style: const TextStyle(color: Colors.white)),
                    ),
                  if (_isRegister) ...[
                    TextFormField(
                      controller: _nameCtrl,
                      textInputAction: TextInputAction.next,
                      decoration: const InputDecoration(
                          labelText: 'Display name',
                          prefixIcon: Icon(Icons.person)),
                      validator: (v) {
                        final s = v?.trim() ?? '';
                        if (s.isEmpty) return 'Please enter a name';
                        if (s.length < 2) return 'Name is too short';
                        if (s.length > 20) return 'Max 20 characters';
                        return null;
                      },
                    ),
                    const SizedBox(height: 12),
                  ],
                  TextFormField(
                    controller: _emailCtrl,
                    keyboardType: TextInputType.emailAddress,
                    textInputAction: TextInputAction.next,
                    decoration: const InputDecoration(
                        labelText: 'Email', prefixIcon: Icon(Icons.email)),
                    validator: (v) {
                      final s = v?.trim() ?? '';
                      if (s.isEmpty) return 'Please enter your email';
                      if (!_emailRe.hasMatch(s)) return 'Enter a valid email address';
                      return null;
                    },
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: _passCtrl,
                    obscureText: _hidePass,
                    textInputAction: TextInputAction.done,
                    onFieldSubmitted: (_) {
                      if (!_loading) _submitEmail();
                    },
                    decoration: InputDecoration(
                      labelText: 'Password',
                      prefixIcon: const Icon(Icons.lock),
                      suffixIcon: IconButton(
                        icon: Icon(_hidePass ? Icons.visibility : Icons.visibility_off),
                        onPressed: () => setState(() => _hidePass = !_hidePass),
                      ),
                    ),
                    validator: (v) {
                      final s = v ?? '';
                      if (s.isEmpty) return 'Please enter your password';
                      if (_isRegister && s.length < 6) {
                        return 'Password must be at least 6 characters';
                      }
                      return null;
                    },
                  ),
                  if (!_isRegister)
                    Align(
                      alignment: Alignment.centerRight,
                      child: TextButton(
                          onPressed: _loading ? null : _forgotPassword,
                          child: const Text('Forgot password?')),
                    ),
                  const SizedBox(height: 12),
                  ElevatedButton(
                    onPressed: _loading ? null : _submitEmail,
                    child: _loading
                        ? const SizedBox(
                            width: 22,
                            height: 22,
                            child: CircularProgressIndicator(strokeWidth: 2))
                        : Text(_isRegister ? 'Register' : 'Login',
                            style: const TextStyle(fontSize: 16)),
                  ),
                  TextButton(
                    onPressed: _loading
                        ? null
                        : () => setState(() {
                              _isRegister = !_isRegister;
                              _err = null;
                            }),
                    child: Text(_isRegister
                        ? 'Already have an account? Login'
                        : 'New here? Create an account'),
                  ),
                  const Row(children: [
                    Expanded(child: Divider()),
                    Padding(
                        padding: EdgeInsets.symmetric(horizontal: 8),
                        child: Text('or', style: TextStyle(color: Colors.grey))),
                    Expanded(child: Divider()),
                  ]),
                  const SizedBox(height: 12),
                  SizedBox(
                    width: double.infinity,
                    height: 50,
                    child: ElevatedButton.icon(
                      onPressed: _loading ? null : _signInWithGoogle,
                      icon: Image.asset('assets/google-logo.jpg', height: 24, width: 24),
                      label: const Text('Continue with Google',
                          style: TextStyle(fontSize: 16)),
                      style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.white,
                          foregroundColor: Colors.black),
                    ),
                  ),
                  const SizedBox(height: 12),
                  OutlinedButton(
                    onPressed: _loading ? null : _signInAnonymously,
                    child: const Text('Play as Guest', style: TextStyle(fontSize: 16)),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
