import 'package:supabase_flutter/supabase_flutter.dart';

/// Signed-in field operator. Only the auth id and e-mail; no phone number.
class FieldUser {
  const FieldUser({required this.id, required this.email});

  final String id;
  final String email;
}

class AuthFailure implements Exception {
  const AuthFailure(this.message);

  final String message;

  @override
  String toString() => message;
}

abstract interface class AuthRepository {
  FieldUser? get currentUser;

  /// Throws [AuthFailure] with a Turkish message on failure.
  Future<FieldUser> signIn({required String email, required String password});
  Future<void> signOut();
}

/// Supabase e-mail + password sign-in.
class SupabaseAuthRepository implements AuthRepository {
  SupabaseAuthRepository(this._client);

  final SupabaseClient _client;

  @override
  FieldUser? get currentUser {
    final u = _client.auth.currentUser;
    return u == null ? null : FieldUser(id: u.id, email: u.email ?? '');
  }

  @override
  Future<FieldUser> signIn({
    required String email,
    required String password,
  }) async {
    try {
      final res = await _client.auth.signInWithPassword(
        email: email,
        password: password,
      );
      final u = res.user;
      if (u == null) throw const AuthFailure('Giriş yapılamadı');
      return FieldUser(id: u.id, email: u.email ?? email);
    } on AuthException catch (e) {
      throw AuthFailure(
        e.statusCode == '400' ? 'E-posta ya da parola hatalı' : e.message,
      );
    } on AuthFailure {
      rethrow;
    } catch (_) {
      throw const AuthFailure('Sunucuya ulaşılamadı');
    }
  }

  @override
  Future<void> signOut() => _client.auth.signOut();
}

/// Offline sign-in for development: the sample users from `supabase/seed.sql`
/// with the shared development password.
class DevAuthRepository implements AuthRepository {
  DevAuthRepository();

  static const String devPassword = 'orchados-dev';
  static const Map<String, String> devUsers = {
    'field@example.com': 'a0000000-0000-4000-8000-000000000003',
    'ops@example.com': 'a0000000-0000-4000-8000-000000000005',
  };

  FieldUser? _user;

  @override
  FieldUser? get currentUser => _user;

  @override
  Future<FieldUser> signIn({
    required String email,
    required String password,
  }) async {
    final id = devUsers[email.trim().toLowerCase()];
    if (id == null || password != devPassword) {
      throw const AuthFailure('E-posta ya da parola hatalı');
    }
    return _user = FieldUser(id: id, email: email.trim().toLowerCase());
  }

  @override
  Future<void> signOut() async => _user = null;
}
