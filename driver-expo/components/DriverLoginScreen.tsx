import { useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { clearLocalAuth } from "../lib/auth-session";
import { supabase, validateDriverSession } from "../lib/supabase";

type Props = {
  onLoggedIn: () => void;
};

export function DriverLoginScreen({ onLoggedIn }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin() {
    setError(null);
    const trimmed = email.trim();
    if (!trimmed || password.length < 6) {
      setError("Email dan password (min. 6 karakter) wajib diisi.");
      return;
    }

    setLoading(true);
    try {
      await clearLocalAuth();
      const { data, error: signErr } = await supabase.auth.signInWithPassword({
        email: trimmed,
        password,
      });

      if (signErr) {
        setError(signErr.message);
        return;
      }

      if (!data.session) {
        setError("Login gagal. Cek email/password.");
        return;
      }

      const roleErr = await validateDriverSession(data.session);
      if (roleErr) {
        await supabase.auth.signOut();
        setError(roleErr);
        return;
      }

      onLoggedIn();
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.welcome}>
        <Image
          source={require("../assets/logo.png")}
          style={styles.logo}
          resizeMode="contain"
          accessibilityLabel="WIRA Driver"
        />
      </View>
      <View style={styles.card}>
        <Text style={styles.badge}>WIRA DRIVER</Text>
        <Text style={styles.title}>Masuk Driver</Text>
        <Text style={styles.sub}>
          Login langsung di aplikasi. Admin membuat akun di panel Admin → Drivers.
        </Text>

        {error && <Text style={styles.error}>{error}</Text>}

        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="driver@email.com"
          placeholderTextColor="#64748b"
        />

        <Text style={styles.label}>Password</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="••••••••"
          placeholderTextColor="#64748b"
        />

        <Pressable
          style={[styles.btn, loading && styles.btnDisabled]}
          onPress={handleLogin}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#0f172a" />
          ) : (
            <Text style={styles.btnText}>Masuk</Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#0f172a",
    justifyContent: "center",
    padding: 24,
  },
  welcome: {
    alignItems: "center",
    marginBottom: 20,
  },
  logo: {
    width: 280,
    height: 120,
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(15,23,42,0.9)",
    padding: 24,
  },
  badge: {
    color: "#34d399",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 2,
  },
  title: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "700",
    marginTop: 8,
  },
  sub: {
    color: "#94a3b8",
    fontSize: 13,
    marginTop: 8,
    lineHeight: 20,
  },
  error: {
    color: "#fca5a5",
    fontSize: 13,
    marginTop: 12,
  },
  label: {
    color: "#cbd5e1",
    fontSize: 13,
    marginTop: 16,
    marginBottom: 6,
  },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.05)",
    color: "#fff",
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  btn: {
    marginTop: 24,
    borderRadius: 16,
    backgroundColor: "#34d399",
    paddingVertical: 14,
    alignItems: "center",
  },
  btnDisabled: {
    opacity: 0.7,
  },
  btnText: {
    color: "#0f172a",
    fontSize: 16,
    fontWeight: "700",
  },
});
