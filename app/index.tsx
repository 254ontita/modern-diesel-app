import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  User,
} from "firebase/auth";
import { collection, doc, getDoc, getDocs, orderBy, query, setDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  LogBox,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { auth, db } from "../firebaseConfig";

LogBox.ignoreLogs(["@firebase/auth"]);

const COLORS = {
  primary: "#0F172A",
  accent: "#EA580C",
  background: "#F8FAFC",
  surface: "#FFFFFF",
  textMain: "#1E293B",
  textMuted: "#64748B",
  border: "#E2E8F0",
  success: "#16A34A",
  danger: "#EF4444",
  dangerLight: "#FEF2F2",
  dangerBorder: "#FCA5A5",
};

const STAFF_ROLES = [
  "administrator", "admin", "manager", "service_manager", "dispatch_manager", 
  "stock_manager", "inventory_manager", "finance_manager", 
  "mechanic", "driver", "supplier"
];

export default function PublicStorefront() {
  const [spareParts, setSpareParts] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);

  const [authModalVisible, setAuthModalVisible] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);

  useEffect(() => {
    fetchCatalog();
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        try {
          const userDoc = await getDoc(doc(db, "Users", user.uid));
          if (userDoc.exists()) {
            setUserRole((userDoc.data().role || "").trim().toLowerCase());
          }
        } catch {
          setUserRole(null);
        }
      } else {
        setUserRole(null);
      }
    });
    return unsubscribe;
  }, []);

  const fetchCatalog = async () => {
    setIsLoading(true);
    try {
      const q = query(collection(db, "Spare_Parts"), orderBy("name", "asc"));
      const snapshot = await getDocs(q);
      setSpareParts(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (error) {
      console.error("Catalog fetch error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const getCleanAuthErrorMessage = (error: any): string => {
    const code = error?.code || error?.message || "";
    if (code.includes("invalid-credential") || code.includes("wrong-password")) return "Incorrect email or password. Please verify your credentials.";
    if (code.includes("user-not-found")) return "No account exists with this email address.";
    if (code.includes("invalid-email")) return "Please enter a valid email format.";
    if (code.includes("email-already-in-use")) return "An account with this email address already exists.";
    if (code.includes("weak-password")) return "Password must be at least 6 characters.";
    return "Authentication failed. Please check your credentials.";
  };

  const handleAuthentication = async () => {
    setAuthError(null);
    setAuthNotice(null);

    const cleanEmail = email.trim();
    if (!cleanEmail || !password) return setAuthError("Email address and password are required.");
    if (!isLoginMode && (!fullName.trim() || !username.trim())) return setAuthError("Full Name and Username are required for registration.");

    setAuthLoading(true);
    try {
      if (isLoginMode) {
        const userCred = await signInWithEmailAndPassword(auth, cleanEmail, password);
        await routeUser(userCred.user.uid);
      } else {
        const userCred = await createUserWithEmailAndPassword(auth, cleanEmail, password);
        await setDoc(doc(db, "Users", userCred.user.uid), {
          email: cleanEmail.toLowerCase(),
          fullName: fullName.trim(),
          username: username.trim().toLowerCase(),
          role: "client",
          createdAt: new Date().toISOString(),
        });
        setAuthModalVisible(false);
        resetModalForm();
        router.push("/(portals)/client");
      }
    } catch (error: any) {
      setAuthError(getCleanAuthErrorMessage(error));
    } finally {
      setAuthLoading(false);
    }
  };

  const routeUser = async (uid: string) => {
    try {
      const userDocSnap = await getDoc(doc(db, "Users", uid));
      if (!userDocSnap.exists()) return setAuthError("User record not found in system database.");

      const rawRole = userDocSnap.data().role || "";
      const normalizedRole = rawRole.trim().toLowerCase();

      setAuthModalVisible(false);
      resetModalForm();

      if (normalizedRole === "client") {
        router.push("/(portals)/client");
      } else if (STAFF_ROLES.includes(normalizedRole)) {
        let portalFile = normalizedRole;
        if (normalizedRole === "manager") portalFile = "service_manager";
        if (normalizedRole === "admin") portalFile = "administrator";

        router.push(`/(portals)/${portalFile}` as any);
      } else {
        setAuthError(`Assigned role '${rawRole}' has no configured mobile routing.`);
        setAuthModalVisible(true);
      }
    } catch (err: any) {
      setAuthError("Error loading user profile.");
      setAuthModalVisible(true);
    }
  };

  const handlePasswordReset = async () => {
    setAuthError(null);
    setAuthNotice(null);
    if (!email.trim()) return setAuthError("Enter your email address above to receive reset instructions.");
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setAuthNotice("Password reset link sent to your email.");
    } catch (error: any) {
      setAuthError(getCleanAuthErrorMessage(error));
    }
  };

  const resetModalForm = () => {
    setEmail(""); setPassword(""); setFullName(""); setUsername(""); setAuthError(null); setAuthNotice(null); setShowPassword(false);
  };

  const handleActionClick = () => {
    if (currentUser && userRole) {
      let activeRoute = userRole;
      if (userRole === "manager") activeRoute = "service_manager";
      if (userRole === "admin") activeRoute = "administrator";

      if (userRole === "client") router.push("/(portals)/client");
      else if (STAFF_ROLES.includes(userRole)) router.push(`/(portals)/${activeRoute}` as any);
      else setAuthModalVisible(true);
    } else {
      setAuthModalVisible(true);
    }
  };

  const filteredParts = spareParts.filter((part) => (part.name || "").toLowerCase().includes(searchQuery.toLowerCase()));

  const renderPart = ({ item }: { item: any }) => (
    <View style={styles.card}>
      {item.imageBase64 ? (
        <Image source={{ uri: item.imageBase64 }} style={styles.cardImage} />
      ) : (
        <View style={[styles.cardImage, styles.cardImageFallback]}>
          <Ionicons name="hardware-chip-outline" size={40} color="#94A3B8" />
        </View>
      )}
      <View style={styles.cardContent}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.cardTitle} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.cardPrice}>KES {Number(item.price || 0).toLocaleString()}</Text>
        </View>
        <Text style={styles.cardDescription} numberOfLines={2}>{item.description || "Industrial specification replacement component."}</Text>
        <View style={styles.cardFooter}>
          <View style={styles.stockBadge}>
            <View style={[styles.stockDot, { backgroundColor: Number(item.stock || 0) > 0 ? COLORS.success : COLORS.danger }]} />
            <Text style={styles.stockText}>{Number(item.stock || 0) > 0 ? `${item.stock} Available` : "Out of Stock"}</Text>
          </View>
          <TouchableOpacity style={styles.buyButton} onPress={handleActionClick}>
            <Text style={styles.buyButtonText}>Purchase</Text>
            <Ionicons name="arrow-forward" size={16} color="#FFF" style={{ marginLeft: 4 }} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Ionicons name="cog" size={28} color={COLORS.accent} style={{ marginRight: 8 }} />
          <Text style={styles.logoText}>MODERN<Text style={{ color: COLORS.accent }}>DIESEL</Text></Text>
        </View>
        <TouchableOpacity style={styles.loginBtn} onPress={handleActionClick}>
          <Ionicons name="person-circle-outline" size={24} color={COLORS.textMain} />
          <Text style={styles.loginBtnText}>{currentUser ? "Portal" : "Sign In"}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
        <View style={styles.heroSection}>
          <View style={styles.heroOverlay} />
          <Text style={styles.heroTitle}>Downtime Costs Money.{"\n"}Fix It Fast.</Text>
          <Text style={styles.heroSub}>Get Expert Heavy Machinery Mechanics On-Site in Hours.</Text>
          <TouchableOpacity style={styles.deployButton} onPress={handleActionClick}>
            <Ionicons name="construct" size={20} color="#fff" style={{ marginRight: 8 }} />
            <Text style={styles.deployButtonText}>Request Field Service</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.catalogContainer}>
          <Text style={styles.sectionTitle}>Certified Spare Parts</Text>
          <View style={styles.searchContainer}>
            <Ionicons name="search" size={20} color={COLORS.textMuted} style={styles.searchIcon} />
            <TextInput style={styles.searchInput} placeholder="Search components..." placeholderTextColor={COLORS.textMuted} value={searchQuery} onChangeText={setSearchQuery} />
          </View>

          {isLoading ? (
            <ActivityIndicator size="large" color={COLORS.accent} style={{ marginTop: 40 }} />
          ) : filteredParts.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="cube-outline" size={48} color={COLORS.border} />
              <Text style={styles.emptyStateText}>No parts match your search.</Text>
            </View>
          ) : (
            <FlatList data={filteredParts} keyExtractor={(item) => item.id} renderItem={renderPart} scrollEnabled={false} />
          )}
        </View>
      </ScrollView>

      <Modal visible={authModalVisible} animationType="slide" transparent={true} onRequestClose={() => setAuthModalVisible(false)}>
        <View style={styles.modalBackground}>
          <View style={styles.modalContent}>
            <TouchableOpacity style={styles.closeModal} onPress={() => { setAuthModalVisible(false); resetModalForm(); }}>
              <Ionicons name="close" size={24} color={COLORS.textMain} />
            </TouchableOpacity>

            <Text style={styles.modalTitle}>{isLoginMode ? "Secure Authentication" : "Client Registration"}</Text>

            {authError && (
              <View style={styles.errorBanner}>
                <Ionicons name="alert-circle" size={18} color={COLORS.danger} style={{ marginRight: 8 }} />
                <Text style={styles.errorBannerText}>{authError}</Text>
              </View>
            )}

            {authNotice && (
              <View style={styles.noticeBanner}>
                <Ionicons name="checkmark-circle" size={18} color={COLORS.success} style={{ marginRight: 8 }} />
                <Text style={styles.noticeBannerText}>{authNotice}</Text>
              </View>
            )}

            {!isLoginMode && (
              <>
                <TextInput style={styles.input} placeholder="Full Name" placeholderTextColor={COLORS.textMuted} value={fullName} onChangeText={(t) => { setFullName(t); setAuthError(null); }} />
                <TextInput style={styles.input} placeholder="Username" placeholderTextColor={COLORS.textMuted} value={username} onChangeText={(t) => { setUsername(t); setAuthError(null); }} autoCapitalize="none" />
              </>
            )}

            <TextInput style={styles.input} placeholder="Email Address" placeholderTextColor={COLORS.textMuted} value={email} onChangeText={(t) => { setEmail(t); setAuthError(null); }} autoCapitalize="none" keyboardType="email-address" />

            <View style={styles.passwordContainer}>
              <TextInput style={styles.passwordInput} placeholder="Password" placeholderTextColor={COLORS.textMuted} value={password} onChangeText={(t) => { setPassword(t); setAuthError(null); }} secureTextEntry={!showPassword} />
              <TouchableOpacity style={styles.eyeIcon} onPress={() => setShowPassword(!showPassword)}>
                <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={22} color={COLORS.textMuted} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={[styles.authButton, authLoading && { opacity: 0.7 }]} onPress={handleAuthentication} disabled={authLoading}>
              {authLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.authButtonText}>{isLoginMode ? "Authenticate" : "Create Account"}</Text>}
            </TouchableOpacity>

            <View style={styles.footerRow}>
              <TouchableOpacity onPress={() => { setIsLoginMode(!isLoginMode); setAuthError(null); setAuthNotice(null); }}>
                <Text style={styles.linkText}>{isLoginMode ? "New Client? Sign Up" : "Existing User? Sign In"}</Text>
              </TouchableOpacity>
              {isLoginMode && (
                <TouchableOpacity onPress={handlePasswordReset}>
                  <Text style={styles.linkText}>Reset Password</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, paddingTop: Platform.OS === "ios" ? 50 : 30 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingBottom: 15, backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  logoText: { fontSize: 22, fontWeight: "900", color: COLORS.primary, letterSpacing: -0.5 },
  loginBtn: { flexDirection: "row", alignItems: "center", paddingVertical: 8, paddingHorizontal: 12, backgroundColor: COLORS.background, borderRadius: 20, borderWidth: 1, borderColor: COLORS.border },
  loginBtnText: { color: COLORS.textMain, fontWeight: "700", fontSize: 14, marginLeft: 6 },
  heroSection: { backgroundColor: COLORS.primary, paddingVertical: 40, paddingHorizontal: 25, alignItems: "center", position: "relative" },
  heroOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "#000", opacity: 0.1 },
  heroTitle: { fontSize: 28, fontWeight: "900", color: COLORS.surface, textAlign: "center", marginBottom: 12, letterSpacing: -0.5, lineHeight: 34 },
  heroSub: { fontSize: 15, color: "#CBD5E1", textAlign: "center", marginBottom: 25, fontWeight: "500" },
  deployButton: { flexDirection: "row", backgroundColor: COLORS.accent, paddingVertical: 14, paddingHorizontal: 24, borderRadius: 12, alignItems: "center", shadowColor: COLORS.accent, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 5 },
  deployButtonText: { color: COLORS.surface, fontWeight: "800", fontSize: 16, textTransform: "uppercase", letterSpacing: 0.5 },
  catalogContainer: { paddingHorizontal: 20, paddingTop: 20 },
  sectionTitle: { fontSize: 22, fontWeight: "800", color: COLORS.textMain, marginBottom: 15, letterSpacing: -0.5 },
  searchContainer: { flexDirection: "row", alignItems: "center", backgroundColor: COLORS.surface, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, marginBottom: 20, paddingHorizontal: 15, height: 50 },
  searchIcon: { marginRight: 10 },
  searchInput: { flex: 1, fontSize: 16, color: COLORS.textMain },
  card: { backgroundColor: COLORS.surface, marginBottom: 20, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 3, overflow: "hidden" },
  cardImage: { width: "100%", height: 200, resizeMode: "cover" },
  cardImageFallback: { justifyContent: "center", alignItems: "center", backgroundColor: "#E2E8F0" },
  cardContent: { padding: 16 },
  cardHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 },
  cardTitle: { fontSize: 18, fontWeight: "800", color: COLORS.textMain, flex: 1, marginRight: 10 },
  cardPrice: { fontSize: 18, color: COLORS.accent, fontWeight: "900" },
  cardDescription: { fontSize: 14, color: COLORS.textMuted, marginBottom: 16, lineHeight: 20 },
  cardFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: 12, borderTopWidth: 1, borderTopColor: COLORS.border },
  stockBadge: { flexDirection: "row", alignItems: "center", backgroundColor: COLORS.background, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 12 },
  stockDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  stockText: { fontSize: 13, fontWeight: "600", color: COLORS.textMain },
  buyButton: { flexDirection: "row", backgroundColor: COLORS.primary, paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8, alignItems: "center" },
  buyButtonText: { color: COLORS.surface, fontWeight: "700", fontSize: 14 },
  emptyState: { alignItems: "center", paddingVertical: 40 },
  emptyStateText: { marginTop: 10, color: COLORS.textMuted, fontSize: 16, fontWeight: "500" },
  modalBackground: { flex: 1, backgroundColor: "rgba(15, 23, 42, 0.75)", justifyContent: "flex-end" },
  modalContent: { backgroundColor: COLORS.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: Platform.OS === "ios" ? 44 : 28 },
  closeModal: { alignSelf: "flex-end", padding: 4, marginBottom: 8 },
  modalTitle: { fontSize: 22, fontWeight: "900", color: COLORS.textMain, marginBottom: 18, textAlign: "center", letterSpacing: -0.5 },
  errorBanner: { flexDirection: "row", alignItems: "center", backgroundColor: COLORS.dangerLight, borderWidth: 1, borderColor: COLORS.dangerBorder, borderRadius: 10, padding: 12, marginBottom: 16 },
  errorBannerText: { flex: 1, color: COLORS.danger, fontSize: 13, fontWeight: "600", lineHeight: 18 },
  noticeBanner: { flexDirection: "row", alignItems: "center", backgroundColor: "#F0FDF4", borderWidth: 1, borderColor: "#BBF7D0", borderRadius: 10, padding: 12, marginBottom: 16 },
  noticeBannerText: { flex: 1, color: COLORS.success, fontSize: 13, fontWeight: "600", lineHeight: 18 },
  input: { backgroundColor: COLORS.background, padding: 14, borderRadius: 10, marginBottom: 14, borderWidth: 1, borderColor: COLORS.border, fontSize: 15, color: COLORS.textMain },
  passwordContainer: { flexDirection: "row", alignItems: "center", backgroundColor: COLORS.background, borderRadius: 10, marginBottom: 18, borderWidth: 1, borderColor: COLORS.border },
  passwordInput: { flex: 1, padding: 14, fontSize: 15, color: COLORS.textMain },
  eyeIcon: { padding: 14 },
  authButton: { backgroundColor: COLORS.accent, padding: 15, borderRadius: 10, alignItems: "center", shadowColor: COLORS.accent, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, shadowRadius: 6, elevation: 3 },
  authButtonText: { color: COLORS.surface, fontSize: 15, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5 },
  footerRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 20, paddingHorizontal: 4 },
  linkText: { color: COLORS.primary, fontWeight: "700", fontSize: 13 },
});