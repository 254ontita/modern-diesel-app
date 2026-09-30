import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { signOut, updatePassword } from "firebase/auth";
import {
    addDoc,
    collection,
    doc,
    getDoc,
    getDocs,
    orderBy,
    query,
    serverTimestamp,
    updateDoc
} from "firebase/firestore";
import { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View,
} from "react-native";
import { auth, db } from "../../firebaseConfig";

const COLORS = {
  primary: "#0F172A", accent: "#EA580C", background: "#F8FAFC",
  surface: "#FFFFFF", textMain: "#1E293B", textMuted: "#64748B",
  border: "#E2E8F0", success: "#16A34A", danger: "#EF4444",
};

export default function InventoryManagerPortal() {
  const [userData, setUserData] = useState<any>(null);
  const [assetList, setAssetList] = useState<any[]>([]);
  const [isLoadingAssets, setIsLoadingAssets] = useState(false);

  // Asset Form
  const [assetName, setAssetName] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [assetCategory, setAssetCategory] = useState("");
  const [isSubmittingAsset, setIsSubmittingAsset] = useState(false);

  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showEditProfileModal, setShowEditProfileModal] = useState(false);
  const [editName, setEditName] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);

  useEffect(() => {
    fetchUserData();
    fetchCompanyAssets();
  }, []);

  const fetchUserData = async () => {
    if (auth.currentUser) {
      const userDoc = await getDoc(doc(db, "Users", auth.currentUser.uid));
      if (userDoc.exists()) setUserData(userDoc.data());
    }
  };

  const fetchCompanyAssets = async () => {
    setIsLoadingAssets(true);
    try {
      const q = query(collection(db, "Company_Assets"), orderBy("timestamp", "desc"));
      const snapshot = await getDocs(q);
      setAssetList(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); } finally { setIsLoadingAssets(false); }
  };

  const openEditProfile = () => {
    setEditName(userData?.fullName || userData?.username || "");
    setEditPassword("");
    setShowProfileMenu(false);
    setShowEditProfileModal(true);
  };

  const handleUpdateProfile = async () => {
    if (!auth.currentUser) return;
    setIsUpdatingProfile(true);
    try {
      if (editName.trim()) {
        await updateDoc(doc(db, "Users", auth.currentUser.uid), { fullName: editName.trim() });
        setUserData({ ...userData, fullName: editName.trim() });
      }
      if (editPassword.trim()) {
        await updatePassword(auth.currentUser, editPassword.trim());
        Alert.alert("Success", "Profile and password updated securely.");
      } else {
        Alert.alert("Success", "Profile details updated.");
      }
      setShowEditProfileModal(false);
      setEditPassword("");
    } catch (error: any) {
      if (error.code === 'auth/requires-recent-login') Alert.alert("Security Timeout", "You must sign out and sign back in before changing your password.");
      else Alert.alert("Update Failed", error.message);
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  const registerCompanyAsset = async () => {
    if (!assetName || !serialNumber || !assetCategory) return Alert.alert("Missing Data", "Asset Name, Category, and Serial Number are required.");
    setIsSubmittingAsset(true);
    try {
      await addDoc(collection(db, "Company_Assets"), {
        name: assetName,
        serialNumber: serialNumber,
        category: assetCategory,
        loggedBy: auth.currentUser?.uid,
        timestamp: serverTimestamp()
      });
      setAssetName(""); setSerialNumber(""); setAssetCategory("");
      fetchCompanyAssets();
      Alert.alert("Success", "Asset secured in company database.");
    } catch (error: any) { Alert.alert("Database Error", error.message); } finally { setIsSubmittingAsset(false); }
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerContainer}>
        <View>
          <Text style={styles.headerTitle}>Hi, {userData?.fullName?.split(" ")[0] || "Inventory"}</Text>
          <Text style={styles.welcomeText}>INVENTORY MANAGER</Text>
        </View>
        <TouchableOpacity onPress={() => setShowProfileMenu(!showProfileMenu)}>
          <Ionicons name="person-circle" size={42} color={COLORS.primary} />
        </TouchableOpacity>
      </View>

      <View style={styles.pillTabBar}>
        <View style={[styles.pillTab, styles.activePillTab]}>
          <Text style={[styles.pillTabText, styles.activePillTabText]}>Internal Assets</Text>
        </View>
      </View>

      {showProfileMenu && (
        <View style={styles.profileMenu}>
          <TouchableOpacity style={styles.menuItem} onPress={openEditProfile}>
            <Ionicons name="create-outline" size={20} color={COLORS.textMain} />
            <Text style={styles.menuText}>Edit Profile</Text>
          </TouchableOpacity>
          <View style={styles.menuDivider} />

          <TouchableOpacity style={styles.menuItem} onPress={() => { setShowProfileMenu(false); router.push("/"); }}>
            <Ionicons name="storefront-outline" size={20} color={COLORS.primary} />
            <Text style={styles.menuText}>Public Storefront</Text>
          </TouchableOpacity>
          <View style={styles.menuDivider} />

          <TouchableOpacity style={styles.menuItem} onPress={async () => { await signOut(auth); router.replace("/"); }}>
            <Ionicons name="log-out-outline" size={20} color={COLORS.danger} />
            <Text style={[styles.menuText, { color: COLORS.danger }]}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView contentContainerStyle={styles.formContainer}>
        <Text style={styles.sectionHeader}>Register Internal Asset</Text>
        <TextInput style={styles.input} placeholderTextColor={COLORS.textMuted} placeholder="Asset Name (e.g., Heavy Jack)" value={assetName} onChangeText={setAssetName} />
        <View style={{ flexDirection: "row", gap: 10 }}>
          <TextInput style={[styles.input, { flex: 1 }]} placeholderTextColor={COLORS.textMuted} placeholder="Category" value={assetCategory} onChangeText={setAssetCategory} />
          <TextInput style={[styles.input, { flex: 1 }]} placeholderTextColor={COLORS.textMuted} placeholder="Serial Number" value={serialNumber} onChangeText={setSerialNumber} />
        </View>
        <TouchableOpacity style={styles.submitButton} onPress={registerCompanyAsset} disabled={isSubmittingAsset}>
          {isSubmittingAsset ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitButtonText}>Log Company Asset</Text>}
        </TouchableOpacity>

        <View style={styles.divider} />
        <Text style={styles.sectionHeader}>Asset Vault Records</Text>
        {isLoadingAssets ? <ActivityIndicator color={COLORS.accent} /> : assetList.length === 0 ? (
          <Text style={styles.emptyText}>No internal assets logged.</Text>
        ) : assetList.map((item) => (
          <View key={item.id} style={styles.card}>
            <View style={{flexDirection: 'row', justifyContent: 'space-between'}}>
              <Text style={styles.cardTitle}>{item.name}</Text>
              <Text style={{fontSize: 12, fontWeight: '700', color: COLORS.textMuted}}>{item.category}</Text>
            </View>
            <Text style={styles.detailText}>SN: {item.serialNumber}</Text>
            <Text style={[styles.detailText, { fontSize: 12, marginTop: 4 }]}>
              Registered: {item.timestamp ? new Date(item.timestamp.toDate()).toLocaleDateString() : "Just now"}
            </Text>
          </View>
        ))}
      </ScrollView>

      {/* EDIT PROFILE MODAL */}
      <Modal visible={showEditProfileModal} transparent={true} animationType="fade" onRequestClose={() => setShowEditProfileModal(false)}>
        <TouchableOpacity style={styles.modalOverlayBackground} activeOpacity={1} onPress={() => setShowEditProfileModal(false)}>
          <TouchableWithoutFeedback>
            <View style={styles.actionSheetContent}>
              <View style={styles.modalHeaderRow}>
                <Text style={styles.actionSheetTitle}>Edit Profile</Text>
                <TouchableOpacity onPress={() => setShowEditProfileModal(false)}>
                  <Ionicons name="close-circle" size={28} color={COLORS.textMuted} />
                </TouchableOpacity>
              </View>
              <TextInput style={styles.input} placeholderTextColor={COLORS.textMuted} placeholder="Full Name" value={editName} onChangeText={setEditName} />
              <TextInput style={styles.input} placeholderTextColor={COLORS.textMuted} placeholder="New Password (Optional)" value={editPassword} onChangeText={setEditPassword} secureTextEntry />
              <TouchableOpacity style={styles.submitButton} onPress={handleUpdateProfile} disabled={isUpdatingProfile}>
                {isUpdatingProfile ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitButtonText}>Save Changes</Text>}
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, paddingTop: Platform.OS === "ios" ? 50 : 30 },
  headerContainer: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingBottom: 15, backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  welcomeText: { fontSize: 13, color: COLORS.textMuted, fontWeight: "700", marginTop: 2, letterSpacing: 0.5 },
  headerTitle: { fontSize: 26, fontWeight: "900", color: COLORS.textMain, letterSpacing: -0.5 },
  pillTabBar: { flexDirection: "row", backgroundColor: COLORS.surface, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border, gap: 8 },
  pillTab: { flex: 1, paddingVertical: 10, alignItems: "center", borderRadius: 20, backgroundColor: COLORS.background },
  activePillTab: { backgroundColor: COLORS.primary },
  pillTabText: { fontSize: 14, color: COLORS.textMuted, fontWeight: "700" },
  activePillTabText: { color: COLORS.surface },
  formContainer: { padding: 20, paddingBottom: 60 },
  sectionHeader: { fontSize: 20, fontWeight: "800", color: COLORS.textMain, marginBottom: 16, letterSpacing: -0.5 },
  input: { backgroundColor: COLORS.surface, padding: 16, borderRadius: 12, marginBottom: 16, borderWidth: 1, borderColor: COLORS.border, fontSize: 16, color: COLORS.textMain },
  submitButton: { backgroundColor: COLORS.accent, padding: 16, borderRadius: 12, alignItems: "center", shadowColor: COLORS.accent, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4 },
  submitButtonText: { color: COLORS.surface, fontWeight: "800", fontSize: 16, textTransform: "uppercase" },
  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: 24 },
  card: { backgroundColor: COLORS.surface, padding: 20, borderRadius: 16, marginBottom: 16, borderWidth: 1, borderColor: COLORS.border },
  cardTitle: { fontSize: 18, fontWeight: "800", color: COLORS.textMain, marginBottom: 4 },
  detailText: { fontSize: 15, color: COLORS.textMuted },
  emptyText: { textAlign: "center", color: COLORS.textMuted, marginTop: 16, fontSize: 15, fontWeight: "500" },
  profileMenu: { position: "absolute", top: 70, right: 20, backgroundColor: COLORS.surface, borderRadius: 12, padding: 10, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 5, zIndex: 20, width: 220, borderWidth: 1, borderColor: COLORS.border },
  menuItem: { flexDirection: "row", alignItems: "center", paddingVertical: 12, paddingHorizontal: 8 },
  menuText: { marginLeft: 12, fontSize: 15, fontWeight: "700", color: COLORS.textMain },
  menuDivider: { height: 1, backgroundColor: COLORS.border, marginVertical: 4 },
  modalOverlayBackground: { flex: 1, backgroundColor: "rgba(15, 23, 42, 0.6)", justifyContent: "flex-end" },
  actionSheetContent: { backgroundColor: COLORS.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 24 },
  actionSheetTitle: { fontSize: 22, fontWeight: "900", color: COLORS.textMain, letterSpacing: -0.5 },
  modalHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
});