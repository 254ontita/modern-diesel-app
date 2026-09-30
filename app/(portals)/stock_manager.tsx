import { Ionicons } from "@expo/vector-icons";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { signOut, updatePassword } from "firebase/auth";
import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    getDoc,
    getDocs,
    increment,
    orderBy,
    query,
    serverTimestamp,
    updateDoc,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    Image,
    Modal,
    Platform,
    RefreshControl,
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
  border: "#E2E8F0", success: "#16A34A", warning: "#EAB308", danger: "#EF4444",
  info: "#3B82F6", purple: "#8B5CF6"
};

export default function StockManagerPortal() {
  const [activeTab, setActiveTab] = useState<"insights" | "catalog" | "procurement">("insights");
  const [userData, setUserData] = useState<any>(null);
  
  const [catalogList, setCatalogList] = useState<any[]>([]);
  const [procurementRequests, setProcurementRequests] = useState<any[]>([]);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(false);
  const [isLoadingRequests, setIsLoadingRequests] = useState(false);

  // Custom Alert State
  const [alertConfig, setAlertConfig] = useState<{
    visible: boolean; title: string; message: string; type: "success" | "error" | "confirm"; onConfirm?: () => void;
  }>({ visible: false, title: "", message: "", type: "success" });

  // Catalog Form
  const [partName, setPartName] = useState("");
  const [partPrice, setPartPrice] = useState("");
  const [partStock, setPartStock] = useState("");
  const [partDescription, setPartDescription] = useState("");
  const [partImageUri, setPartImageUri] = useState<string | null>(null);
  const [isAddingPart, setIsAddingPart] = useState(false);

  // Procurement Form
  const [selectedPartForRequest, setSelectedPartForRequest] = useState<any>(null);
  const [requestQty, setRequestQty] = useState("");
  const [requestCost, setRequestCost] = useState("");
  const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);
  const [showCatalogSelectModal, setShowCatalogSelectModal] = useState(false);

  // Profile
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showEditProfileModal, setShowEditProfileModal] = useState(false);
  const [editName, setEditName] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);

  const showAlert = (title: string, message: string, type: "success" | "error" | "confirm" = "success", onConfirm?: () => void) => {
    setAlertConfig({ visible: true, title, message, type, onConfirm });
  };

  useEffect(() => {
    fetchUserData();
    fetchCatalog();
    fetchProcurementRequests();
  }, []);

  const fetchUserData = async () => {
    if (auth.currentUser) {
      const userDoc = await getDoc(doc(db, "Users", auth.currentUser.uid));
      if (userDoc.exists()) setUserData(userDoc.data());
    }
  };

  const fetchCatalog = async () => {
    setIsLoadingCatalog(true);
    try {
      const q = query(collection(db, "Spare_Parts"), orderBy("name", "asc"));
      const snapshot = await getDocs(q);
      setCatalogList(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); } finally { setIsLoadingCatalog(false); }
  };

  const fetchProcurementRequests = async () => {
    setIsLoadingRequests(true);
    try {
      const q = query(collection(db, "Procurement_Requests"), orderBy("timestamp", "desc"));
      const snapshot = await getDocs(q);
      setProcurementRequests(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); } finally { setIsLoadingRequests(false); }
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
        showAlert("Secured", "Profile and password updated securely.", "success");
      } else {
        showAlert("Updated", "Profile details updated.", "success");
      }
      setShowEditProfileModal(false);
      setEditPassword("");
    } catch (error: any) {
      if (error.code === 'auth/requires-recent-login') showAlert("Security Timeout", "You must sign out and sign back in before changing your password.", "error");
      else showAlert("Update Failed", error.message, "error");
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  const pickImage = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({ 
      mediaTypes: ["images"], 
      allowsEditing: true, 
      aspect: [4, 3], 
      quality: 1 
    });
    if (!result.canceled) setPartImageUri(result.assets[0].uri);
  };

  const addSparePart = async () => {
    if (!partName || !partPrice || !partStock) return showAlert("Error", "Name, Price, and Stock required.", "error");
    setIsAddingPart(true);
    try {
      let base64String = null;
      if (partImageUri) {
        const manipResult = await ImageManipulator.manipulateAsync(partImageUri, [{ resize: { width: 400 } }], { compress: 0.2, format: ImageManipulator.SaveFormat.JPEG, base64: true });
        if (manipResult.base64) base64String = `data:image/jpeg;base64,${manipResult.base64}`;
      }
      await addDoc(collection(db, "Spare_Parts"), { name: partName, price: parseFloat(partPrice), stock: parseInt(partStock, 10), description: partDescription, imageBase64: base64String, addedBy: auth.currentUser?.uid, salesCount: 0, timestamp: serverTimestamp() });
      setPartName(""); setPartPrice(""); setPartStock(""); setPartDescription(""); setPartImageUri(null);
      fetchCatalog();
      showAlert("Success", "Component pushed to public storefront.", "success");
    } catch (error: any) { showAlert("Error", error.message, "error"); } finally { setIsAddingPart(false); }
  };

  const deleteSparePart = (id: string) => {
    showAlert("Delete Part", "Are you sure you want to permanently remove this from the catalog?", "confirm", async () => {
      try { 
        await deleteDoc(doc(db, "Spare_Parts", id)); 
        fetchCatalog(); 
        setAlertConfig({ ...alertConfig, visible: false });
      } catch (error: any) { showAlert("Error", error.message, "error"); }
    });
  };

  const submitProcurementRequest = async () => {
    if (!selectedPartForRequest || !requestQty || !requestCost) return showAlert("Missing Data", "Select an item and enter quantity/cost.", "error");
    setIsSubmittingRequest(true);
    try {
      await addDoc(collection(db, "Procurement_Requests"), {
        partId: selectedPartForRequest.id,
        itemName: selectedPartForRequest.name,
        quantity: parseInt(requestQty, 10),
        estimatedCost: parseFloat(requestCost),
        status: "pending_finance",
        requestedBy: auth.currentUser?.uid,
        timestamp: serverTimestamp()
      });
      setSelectedPartForRequest(null); setRequestQty(""); setRequestCost("");
      fetchProcurementRequests();
      showAlert("Request Submitted", "Sent to Finance Manager for approval.", "success");
    } catch (error: any) { showAlert("Error", error.message, "error"); } finally { setIsSubmittingRequest(false); }
  };

  const receiveAndRestock = (requestData: any) => {
    showAlert("Confirm Restock", `Add ${requestData.quantity}x ${requestData.itemName} to the live catalog?`, "confirm", async () => {
      try {
        if (requestData.partId) {
          await updateDoc(doc(db, "Spare_Parts", requestData.partId), {
            stock: increment(requestData.quantity)
          });
        }
        await updateDoc(doc(db, "Procurement_Requests", requestData.id), {
          status: "restocked_archived"
        });
        fetchCatalog();
        fetchProcurementRequests();
        setAlertConfig({ ...alertConfig, visible: false });
        setTimeout(() => showAlert("Success", "Stock updated in public catalog.", "success"), 500);
      } catch (error: any) { showAlert("Error", error.message, "error"); }
    });
  };

  const formatStatus = (status: string) => {
    if (status === "pending_finance") return "AWAITING FINANCE";
    if (status === "finance_approved") return "APPROVED - AWAITING SUPPLIER";
    if (status === "finance_rejected") return "REJECTED BY FINANCE";
    if (status === "supplier_processing") return "SUPPLIER PROCESSING";
    if (status === "in_transit") return "IN TRANSIT";
    if (status === "delivered") return "DELIVERED TO BAY";
    if (status === "restocked_archived") return "RESTOCKED & ARCHIVED";
    return status.toUpperCase();
  };

  const getStatusColor = (status: string) => {
    if (status.includes("finance_rejected")) return COLORS.danger;
    if (status.includes("pending_finance")) return COLORS.warning;
    if (status.includes("in_transit") || status.includes("supplier")) return COLORS.purple;
    if (status.includes("delivered") || status.includes("approved")) return COLORS.info;
    if (status.includes("restocked")) return COLORS.success;
    return COLORS.primary;
  };

  const lowStockItems = catalogList.filter(item => (item.stock || 0) <= 5);
  const fastSellingItems = [...catalogList].sort((a, b) => (b.salesCount || 0) - (a.salesCount || 0)).slice(0, 5);

  return (
    <View style={styles.container}>
      <View style={styles.headerContainer}>
        <View>
          <Text style={styles.headerTitle}>Hi, {userData?.fullName?.split(" ")[0] || "Stock"}</Text>
          <Text style={styles.welcomeText}>STOCK MANAGER</Text>
        </View>
        <TouchableOpacity onPress={() => setShowProfileMenu(!showProfileMenu)}>
          <Ionicons name="person-circle" size={42} color={COLORS.primary} />
        </TouchableOpacity>
      </View>

      <View style={styles.pillTabBar}>
        <TouchableOpacity style={[styles.pillTab, activeTab === "insights" && styles.activePillTab]} onPress={() => setActiveTab("insights")}>
          <Text style={[styles.pillTabText, activeTab === "insights" && styles.activePillTabText]}>Insights</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.pillTab, activeTab === "catalog" && styles.activePillTab]} onPress={() => setActiveTab("catalog")}>
          <Text style={[styles.pillTabText, activeTab === "catalog" && styles.activePillTabText]}>Catalog</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.pillTab, activeTab === "procurement" && styles.activePillTab]} onPress={() => setActiveTab("procurement")}>
          <Text style={[styles.pillTabText, activeTab === "procurement" && styles.activePillTabText]}>Requests</Text>
        </TouchableOpacity>
      </View>

      {showProfileMenu && (
        <View style={styles.profileMenu}>
          <TouchableOpacity style={styles.menuItem} onPress={() => {setShowProfileMenu(false); setShowEditProfileModal(true);}}>
            <Ionicons name="create-outline" size={20} color={COLORS.textMain} />
            <Text style={styles.menuText}>Edit Profile</Text>
          </TouchableOpacity>
          <View style={styles.menuDivider} />
          <TouchableOpacity style={styles.menuItem} onPress={() => { setShowProfileMenu(false); router.push("/"); }}>
            <Ionicons name="storefront-outline" size={20} color={COLORS.primary} />
            <Text style={styles.menuText}>View Storefront</Text>
          </TouchableOpacity>
          <View style={styles.menuDivider} />
          <TouchableOpacity style={styles.menuItem} onPress={async () => { await signOut(auth); router.replace("/"); }}>
            <Ionicons name="log-out-outline" size={20} color={COLORS.danger} />
            <Text style={[styles.menuText, { color: COLORS.danger }]}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      )}

      {activeTab === "insights" && (
        <ScrollView contentContainerStyle={styles.formContainer} refreshControl={<RefreshControl refreshing={isLoadingCatalog} onRefresh={fetchCatalog} tintColor={COLORS.accent} />}>
          <Text style={styles.sectionHeader}>Critical Low Stock Alerts</Text>
          {lowStockItems.length === 0 ? (
             <View style={styles.emptyState}>
               <Ionicons name="checkmark-circle-outline" size={48} color={COLORS.success} />
               <Text style={styles.emptyStateText}>All items are well stocked.</Text>
             </View>
          ) : (
            lowStockItems.map(item => (
              <View key={item.id} style={styles.alertCard}>
                <View style={styles.alertCardHeader}>
                  <View style={{flexDirection: 'row', alignItems: 'center'}}>
                    <Ionicons name="warning" size={20} color={COLORS.danger} style={{marginRight: 8}} />
                    <Text style={styles.alertCardTitle}>{item.name}</Text>
                  </View>
                  <View style={styles.criticalBadge}>
                    <Text style={styles.criticalBadgeText}>{item.stock} Left</Text>
                  </View>
                </View>
                <TouchableOpacity 
                  style={styles.restockActionBtn}
                  onPress={() => { setSelectedPartForRequest(item); setActiveTab("procurement"); }}
                >
                  <Ionicons name="add-circle" size={18} color={COLORS.primary} style={{marginRight: 6}} />
                  <Text style={styles.restockActionText}>Draft Replenishment Request</Text>
                </TouchableOpacity>
              </View>
            ))
          )}

          <View style={styles.divider} />
          <Text style={styles.sectionHeader}>Fast Selling Components</Text>
          {fastSellingItems.map(item => (
            <View key={item.id} style={styles.card}>
              <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}>
                <Text style={styles.cardTitle}>{item.name}</Text>
                <View style={{backgroundColor: COLORS.success + '15', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10}}>
                  <Text style={{fontSize: 12, fontWeight: '800', color: COLORS.success}}>Sold: {item.salesCount || 0}</Text>
                </View>
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      {activeTab === "catalog" && (
        <ScrollView contentContainerStyle={styles.formContainer} refreshControl={<RefreshControl refreshing={isLoadingCatalog} onRefresh={fetchCatalog} tintColor={COLORS.accent} />}>
          <Text style={styles.sectionHeader}>Add Spare Part</Text>
          {partImageUri && <Image source={{ uri: partImageUri }} style={styles.previewImage} />}
          <TouchableOpacity style={[styles.submitButton, {backgroundColor: COLORS.primary, marginBottom: 16}]} onPress={pickImage}>
            <Text style={styles.submitButtonText}>Select Image</Text>
          </TouchableOpacity>
          <TextInput style={styles.input} placeholderTextColor={COLORS.textMuted} placeholder="Part Name" value={partName} onChangeText={setPartName} />
          <View style={{ flexDirection: "row", gap: 10 }}>
            <TextInput style={[styles.input, { flex: 1 }]} placeholderTextColor={COLORS.textMuted} placeholder="Price (KES)" value={partPrice} onChangeText={setPartPrice} keyboardType="numeric" />
            <TextInput style={[styles.input, { flex: 1 }]} placeholderTextColor={COLORS.textMuted} placeholder="Initial Stock" value={partStock} onChangeText={setPartStock} keyboardType="numeric" />
          </View>
          <TextInput style={[styles.input, { height: 80, textAlignVertical: "top" }]} placeholderTextColor={COLORS.textMuted} placeholder="Description..." value={partDescription} onChangeText={setPartDescription} multiline />
          <TouchableOpacity style={styles.submitButton} onPress={addSparePart} disabled={isAddingPart}>
            {isAddingPart ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitButtonText}>Publish to Store</Text>}
          </TouchableOpacity>

          <View style={styles.divider} />
          <Text style={styles.sectionHeader}>Active Catalog</Text>
          {catalogList.map((item) => (
            <View key={item.id} style={styles.inventoryCard}>
              {item.imageBase64 && <Image source={{ uri: item.imageBase64 }} style={styles.catalogThumb} />}
              <View style={{ flex: 1, paddingLeft: item.imageBase64 ? 15 : 0 }}>
                <Text style={[styles.cardTitle, {fontSize: 16}]} numberOfLines={1}>{item.name}</Text>
                <Text style={{ color: COLORS.accent, fontWeight: "800" }}>KES {item.price.toLocaleString()} <Text style={{ color: COLORS.textMuted, fontWeight: "500" }}>| Stock: {item.stock}</Text></Text>
              </View>
              <TouchableOpacity onPress={() => deleteSparePart(item.id)} style={styles.deleteBtn}><Ionicons name="trash" size={20} color="#fff" /></TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      )}

      {activeTab === "procurement" && (
        <ScrollView contentContainerStyle={styles.formContainer} refreshControl={<RefreshControl refreshing={isLoadingRequests} onRefresh={fetchProcurementRequests} tintColor={COLORS.accent} />}>
          <Text style={styles.sectionHeader}>Request Replenishment</Text>
          <TouchableOpacity style={styles.input} onPress={() => setShowCatalogSelectModal(true)}>
            <Text style={{ color: selectedPartForRequest ? COLORS.textMain : COLORS.textMuted, fontSize: 16 }}>
              {selectedPartForRequest ? selectedPartForRequest.name : "Select Part from Catalog"}
            </Text>
          </TouchableOpacity>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <TextInput style={[styles.input, { flex: 1 }]} placeholderTextColor={COLORS.textMuted} placeholder="Qty Needed" value={requestQty} onChangeText={setRequestQty} keyboardType="numeric" />
            <TextInput style={[styles.input, { flex: 1 }]} placeholderTextColor={COLORS.textMuted} placeholder="Est. Cost" value={requestCost} onChangeText={setRequestCost} keyboardType="numeric" />
          </View>
          <TouchableOpacity style={styles.submitButton} onPress={submitProcurementRequest} disabled={isSubmittingRequest}>
            {isSubmittingRequest ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitButtonText}>Submit to Finance</Text>}
          </TouchableOpacity>

          <View style={styles.divider} />
          <Text style={styles.sectionHeader}>Procurement Pipeline</Text>
          {procurementRequests.map((item) => {
            const statusCol = getStatusColor(item.status);
            return (
              <View key={item.id} style={styles.card}>
                <View style={{flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8}}>
                  <Text style={[styles.cardTitle, {flex: 1}]} numberOfLines={1}>{item.itemName}</Text>
                  <Text style={{fontSize: 16, fontWeight: '900', color: COLORS.textMain, marginLeft: 10}}>x{item.quantity}</Text>
                </View>
                <Text style={styles.detailText}>Est. Cost: KES {item.estimatedCost.toLocaleString()}</Text>
                
                {item.supplierETA && (
                  <Text style={[styles.detailText, {color: COLORS.primary, fontWeight: '600', marginTop: 4}]}>
                    Supplier ETA: {item.supplierETA}
                  </Text>
                )}

                <View style={[styles.statusPill, { alignSelf: 'flex-start', marginTop: 8, backgroundColor: statusCol + "15", borderColor: statusCol + "40" }]}>
                  <Text style={[styles.statusPillText, { color: statusCol }]}>{formatStatus(item.status)}</Text>
                </View>

                {item.status === "delivered" && (
                  <TouchableOpacity style={[styles.submitButton, { backgroundColor: COLORS.success, marginTop: 15, padding: 12 }]} onPress={() => receiveAndRestock(item)}>
                    <Text style={[styles.submitButtonText, { fontSize: 14 }]}>Receive & Restock</Text>
                  </TouchableOpacity>
                )}
              </View>
            )
          })}
        </ScrollView>
      )}

      {/* SELECT CATALOG ITEM MODAL */}
      <Modal visible={showCatalogSelectModal} transparent={true} animationType="slide">
        <View style={styles.modalOverlayBackground}>
          <View style={[styles.actionSheetContent, {height: '70%'}]}>
            <Text style={[styles.actionSheetTitle, {marginBottom: 15}]}>Select Component</Text>
            <FlatList
              data={catalogList}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.catalogListItem} onPress={() => { setSelectedPartForRequest(item); setShowCatalogSelectModal(false); }}>
                  <Text style={{ fontWeight: "800", color: COLORS.textMain, fontSize: 16 }}>{item.name}</Text>
                  <Text style={{ color: COLORS.textMuted, fontSize: 14 }}>Current Stock: {item.stock}</Text>
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity style={[styles.submitButton, { backgroundColor: COLORS.textMuted, marginTop: 16 }]} onPress={() => setShowCatalogSelectModal(false)}>
              <Text style={styles.submitButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

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

      {/* CUSTOM THEMED ALERT MODAL */}
      <Modal visible={alertConfig.visible} transparent={true} animationType="fade">
        <View style={styles.modalOverlayBackground}>
          <View style={styles.customAlertBox}>
            <View style={{alignItems: 'center', marginBottom: 15}}>
              {alertConfig.type === "success" && <Ionicons name="checkmark-circle" size={48} color={COLORS.success} />}
              {alertConfig.type === "error" && <Ionicons name="warning" size={48} color={COLORS.danger} />}
              {alertConfig.type === "confirm" && <Ionicons name="help-circle" size={48} color={COLORS.primary} />}
            </View>
            <Text style={styles.customAlertTitle}>{alertConfig.title}</Text>
            <Text style={styles.customAlertMessage}>{alertConfig.message}</Text>
            
            {alertConfig.type === "confirm" ? (
              <View style={{flexDirection: 'row', gap: 10, marginTop: 20}}>
                <TouchableOpacity style={[styles.submitButton, {flex: 1, backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border}]} onPress={() => setAlertConfig({...alertConfig, visible: false})}>
                  <Text style={[styles.submitButtonText, {color: COLORS.textMain}]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.submitButton, {flex: 1, backgroundColor: COLORS.danger}]} onPress={alertConfig.onConfirm}>
                  <Text style={styles.submitButtonText}>Confirm</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={[styles.submitButton, {marginTop: 20}]} onPress={() => setAlertConfig({...alertConfig, visible: false})}>
                <Text style={styles.submitButtonText}>Acknowledge</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
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
  previewImage: { width: "100%", height: 200, borderRadius: 12, resizeMode: "cover", marginBottom: 16 },
  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: 24 },
  card: { backgroundColor: COLORS.surface, padding: 20, borderRadius: 16, marginBottom: 16, borderWidth: 1, borderColor: COLORS.border },
  cardTitle: { fontSize: 18, fontWeight: "800", color: COLORS.textMain },
  detailText: { fontSize: 15, color: COLORS.textMuted },
  inventoryCard: { backgroundColor: COLORS.surface, padding: 16, borderRadius: 16, marginBottom: 12, borderWidth: 1, borderColor: COLORS.border, flexDirection: "row", alignItems: "center" },
  catalogThumb: { width: 60, height: 60, borderRadius: 10, resizeMode: "cover" },
  deleteBtn: { backgroundColor: COLORS.danger, padding: 10, borderRadius: 10, marginLeft: 12 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1 },
  statusPillText: { fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },
  emptyState: { alignItems: "center", paddingVertical: 40 },
  emptyStateText: { marginTop: 10, color: COLORS.textMuted, fontSize: 16, fontWeight: "500" },
  profileMenu: { position: "absolute", top: 70, right: 20, backgroundColor: COLORS.surface, borderRadius: 12, padding: 10, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 5, zIndex: 20, width: 220, borderWidth: 1, borderColor: COLORS.border },
  menuItem: { flexDirection: "row", alignItems: "center", paddingVertical: 12, paddingHorizontal: 8 },
  menuText: { marginLeft: 12, fontSize: 15, fontWeight: "700", color: COLORS.textMain },
  menuDivider: { height: 1, backgroundColor: COLORS.border, marginVertical: 4 },
  modalOverlayBackground: { flex: 1, backgroundColor: "rgba(15, 23, 42, 0.6)", justifyContent: "center", padding: 20 },
  actionSheetContent: { backgroundColor: COLORS.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 24, position: 'absolute', bottom: 0, left: 0, right: 0 },
  actionSheetTitle: { fontSize: 22, fontWeight: "900", color: COLORS.textMain, letterSpacing: -0.5 },
  modalHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  catalogListItem: { padding: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: COLORS.background, borderRadius: 12, marginBottom: 8 },

  // New Alert Styles
  alertCard: { backgroundColor: '#FEF2F2', padding: 16, borderRadius: 12, marginBottom: 12, borderWidth: 1, borderColor: '#FCA5A5' },
  alertCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  alertCardTitle: { fontSize: 16, fontWeight: "800", color: COLORS.textMain },
  criticalBadge: { backgroundColor: COLORS.danger, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  criticalBadgeText: { color: COLORS.surface, fontSize: 12, fontWeight: "800" },
  restockActionBtn: { flexDirection: 'row', alignItems: 'center', marginTop: 12, alignSelf: 'flex-start', backgroundColor: COLORS.surface, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border },
  restockActionText: { color: COLORS.primary, fontWeight: '700', fontSize: 13 },

  customAlertBox: { backgroundColor: COLORS.surface, borderRadius: 20, padding: 24, width: '100%', shadowColor: "#000", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.15, shadowRadius: 20, elevation: 10 },
  customAlertTitle: { fontSize: 22, fontWeight: "900", color: COLORS.textMain, textAlign: 'center', marginBottom: 8 },
  customAlertMessage: { fontSize: 16, color: COLORS.textMuted, textAlign: 'center', lineHeight: 22 },
});