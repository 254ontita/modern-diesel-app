import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { signOut, updatePassword } from "firebase/auth";
import {
    addDoc,
    collection,
    doc,
    getDoc,
    getDocs,
    increment,
    query,
    serverTimestamp,
    updateDoc,
    where,
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
    View
} from "react-native";
import { auth, db } from "../../firebaseConfig";

const COLORS = {
  primary: "#0F172A",
  accent: "#EA580C",
  background: "#F8FAFC",
  surface: "#FFFFFF",
  textMain: "#1E293B",
  textMuted: "#64748B",
  border: "#E2E8F0",
  success: "#16A34A",
  warning: "#EAB308",
  danger: "#EF4444",
  purple: "#8B5CF6",
  info: "#3B82F6",
};

export default function ClientPortal() {
  const [userData, setUserData] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<"services" | "store">("services");
  
  // Data States
  const [serviceRequests, setServiceRequests] = useState<any[]>([]);
  const [catalogList, setCatalogList] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [cart, setCart] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  // UI States
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showEditProfileModal, setShowEditProfileModal] = useState(false);
  const [showServiceModal, setShowServiceModal] = useState(false);
  const [showCartModal, setShowCartModal] = useState(false);
  
  // Forms
  const [editName, setEditName] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  
  const [machineDetails, setMachineDetails] = useState("");
  const [location, setLocation] = useState("");
  const [issueDescription, setIssueDescription] = useState("");
  const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);
  const [isCheckingOut, setIsCheckingOut] = useState(false);

  const [alertConfig, setAlertConfig] = useState<{
    visible: boolean; title: string; message: string; type: "success" | "error" | "confirm"; onConfirm?: () => void;
  }>({ visible: false, title: "", message: "", type: "success" });

  useEffect(() => {
    fetchUserData();
    fetchClientData(true);
  }, []);

  const fetchUserData = async () => {
    if (auth.currentUser) {
      const userDoc = await getDoc(doc(db, "Users", auth.currentUser.uid));
      if (userDoc.exists()) setUserData(userDoc.data());
    }
  };

  const fetchClientData = async (initial = false) => {
    if (!auth.currentUser) return;
    if (initial) setIsLoading(true);
    try {
      // 1. Fetch Client's Service Requests
      const qReq = query(collection(db, "Service_Requests"), where("clientId", "==", auth.currentUser.uid));
      const snapReq = await getDocs(qReq);
      const requests = snapReq.docs.map(d => ({ id: d.id, ...d.data() })).sort((a: any, b: any) => {
        return (b.timestamp?.toMillis() || 0) - (a.timestamp?.toMillis() || 0);
      });
      setServiceRequests(requests);

      // 2. Fetch Public Storefront Catalog
      const snapCat = await getDocs(collection(db, "Spare_Parts"));
      const parts = snapCat.docs.map(d => ({ id: d.id, ...d.data() })).sort((a: any, b: any) => a.name.localeCompare(b.name));
      // Only show items that are actually in stock
      setCatalogList(parts.filter((p: any) => p.stock > 0));
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const showAlert = (title: string, message: string, type: "success" | "error" | "confirm" = "success", onConfirm?: () => void) => {
    setAlertConfig({ visible: true, title, message, type, onConfirm });
  };

  // --- SERVICE REQUEST LOGIC ---
  const submitServiceRequest = async () => {
    if (!machineDetails || !location || !issueDescription) {
      return showAlert("Missing Details", "Please fill in all fields so our mechanics can prepare adequately.", "error");
    }
    setIsSubmittingRequest(true);
    try {
      await addDoc(collection(db, "Service_Requests"), {
        clientId: auth.currentUser?.uid,
        machineDetails,
        location,
        issueDescription,
        status: "pending",
        timestamp: serverTimestamp()
      });
      setMachineDetails(""); setLocation(""); setIssueDescription("");
      setShowServiceModal(false);
      fetchClientData();
      showAlert("Request Sent", "Your field service request has been dispatched to our operations team.", "success");
    } catch (error: any) {
      showAlert("Error", error.message, "error");
    } finally {
      setIsSubmittingRequest(false);
    }
  };

  // --- E-COMMERCE LOGIC ---
  const filteredCatalog = catalogList.filter(item => 
    item.name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
    item.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const addToCart = (item: any) => {
    setCart(prev => {
      const existing = prev.find(p => p.id === item.id);
      if (existing) {
        if (existing.qty >= item.stock) {
          showAlert("Stock Limit", "You have reached the maximum available stock for this item.", "error");
          return prev;
        }
        return prev.map(p => p.id === item.id ? { ...p, qty: p.qty + 1 } : p);
      }
      return [...prev, { ...item, qty: 1 }];
    });
  };

  const removeFromCart = (id: string) => {
    setCart(prev => prev.filter(p => p.id !== id));
  };

  const calculateTotal = () => {
    return cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
  };

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    setIsCheckingOut(true);
    try {
      // Process all items in cart: deduct stock and add to salesCount
      for (const item of cart) {
        const partRef = doc(db, "Spare_Parts", item.id);
        await updateDoc(partRef, {
          stock: increment(-item.qty),
          salesCount: increment(item.qty)
        });
      }
      
      setCart([]);
      setShowCartModal(false);
      fetchClientData();
      showAlert("Order Confirmed", "Your payment was successful and your parts are being prepared for delivery.", "success");
    } catch (error: any) {
      showAlert("Checkout Failed", error.message, "error");
    } finally {
      setIsCheckingOut(false);
    }
  };

  // --- PROFILE LOGIC ---
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
        showAlert("Secured", "Profile and password updated.", "success");
      } else {
        showAlert("Success", "Profile updated.", "success");
      }
      setShowEditProfileModal(false);
      setEditPassword("");
    } catch (error: any) {
      showAlert("Update Failed", error.message, "error");
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  const getFirstName = () => {
    if (userData?.fullName) return userData.fullName.split(" ")[0];
    if (auth.currentUser?.email) return auth.currentUser.email.split("@")[0];
    return "Client";
  };

  // --- RENDERERS ---
  const renderServiceRequest = ({ item }: { item: any }) => {
    const timeString = item.timestamp ? new Date(item.timestamp.toDate()).toLocaleDateString() : "Just now";
    
    // Client-Friendly Status Mapping
    let clientStatus = "REQUEST RECEIVED";
    let statusColor = COLORS.warning;
    let iconName = "time-outline";

    if (item.status === "mechanic_assigned") {
      clientStatus = "PREPARING DISPATCH";
      statusColor = COLORS.info;
      iconName = "build-outline";
    }
    if (item.status === "in_transit_to_site") {
      clientStatus = "MECHANIC EN ROUTE";
      statusColor = COLORS.purple;
      iconName = "car-sport-outline";
    }
    if (item.status === "arrived_on_site") {
      clientStatus = "MECHANIC ON-SITE";
      statusColor = COLORS.accent;
      iconName = "location-outline";
    }
    if (item.status === "completed") {
      clientStatus = "REPAIR COMPLETED";
      statusColor = COLORS.success;
      iconName = "checkmark-circle-outline";
    }

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.machineTitle}>{item.machineDetails}</Text>
          <Text style={styles.metaTextLocation}>{timeString}</Text>
        </View>

        <View style={[styles.clientStatusContainer, { backgroundColor: statusColor + "15", borderColor: statusColor + "40" }]}>
          <Ionicons name={iconName as any} size={20} color={statusColor} style={{marginRight: 8}} />
          <Text style={[styles.clientStatusText, { color: statusColor }]}>{clientStatus}</Text>
        </View>

        <View style={styles.detailsContainer}>
          <View style={styles.detailRow}>
            <Ionicons name="location" size={16} color={COLORS.textMuted} />
            <Text style={styles.detailText}>{item.location}</Text>
          </View>
        </View>

        <View style={styles.issueContainer}>
          <Text style={styles.issueLabel}>Reported Issue</Text>
          <Text style={styles.issueText}>{item.issueDescription}</Text>
        </View>
      </View>
    );
  };

  const renderCatalogItem = ({ item }: { item: any }) => (
    <View style={styles.catalogCard}>
      {item.imageBase64 && <Image source={{ uri: item.imageBase64 }} style={styles.catalogImage} />}
      <View style={styles.catalogInfo}>
        <Text style={styles.catalogTitle}>{item.name}</Text>
        <Text style={styles.catalogPrice}>KES {Number(item.price || 0).toLocaleString()}</Text>
        {item.description && <Text style={styles.catalogDesc} numberOfLines={2}>{item.description}</Text>}
      </View>
      <TouchableOpacity style={styles.addToCartBtn} onPress={() => addToCart(item)}>
        <Ionicons name="cart" size={20} color={COLORS.surface} />
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.headerContainer}>
        <View>
          <Text style={styles.headerTitle}>Hi, {getFirstName()}</Text>
          <Text style={styles.welcomeText}>CLIENT PORTAL</Text>
        </View>
        <View style={{flexDirection: 'row', alignItems: 'center', gap: 15}}>
          {activeTab === "store" && (
            <TouchableOpacity onPress={() => setShowCartModal(true)} style={styles.cartIconContainer}>
              <Ionicons name="cart-outline" size={28} color={COLORS.textMain} />
              {cart.length > 0 && (
                <View style={styles.cartBadge}>
                  <Text style={styles.cartBadgeText}>{cart.reduce((s, i) => s + i.qty, 0)}</Text>
                </View>
              )}
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => setShowProfileMenu(!showProfileMenu)}>
            <Ionicons name="person-circle" size={42} color={COLORS.primary} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.segmentContainer}>
        <TouchableOpacity style={[styles.segmentBtn, activeTab === "services" && styles.activeSegmentBtn]} onPress={() => setActiveTab("services")}>
          <Text style={[styles.segmentText, activeTab === "services" && styles.activeSegmentText]}>Field Services</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.segmentBtn, activeTab === "store" && styles.activeSegmentBtn]} onPress={() => setActiveTab("store")}>
          <Text style={[styles.segmentText, activeTab === "store" && styles.activeSegmentText]}>Spare Parts</Text>
        </TouchableOpacity>
      </View>

      {showProfileMenu && (
        <View style={styles.profileMenu}>
          <TouchableOpacity style={styles.menuItem} onPress={() => { setShowProfileMenu(false); setShowEditProfileModal(true); }}>
            <Ionicons name="create-outline" size={20} color={COLORS.textMain} />
            <Text style={styles.menuText}>Edit Profile</Text>
          </TouchableOpacity>
          <View style={styles.menuDivider} />
          <TouchableOpacity style={styles.menuItem} onPress={async () => { await signOut(auth); router.replace("/"); }}>
            <Ionicons name="log-out-outline" size={20} color={COLORS.danger} />
            <Text style={[styles.menuText, { color: COLORS.danger }]}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* FIELD SERVICES TAB */}
      {activeTab === "services" && (
        <View style={{flex: 1}}>
          <View style={{paddingHorizontal: 20, paddingTop: 10, paddingBottom: 10}}>
             <TouchableOpacity style={styles.requestServiceBtn} onPress={() => setShowServiceModal(true)}>
               <Ionicons name="build" size={22} color={COLORS.surface} style={{marginRight: 10}} />
               <Text style={styles.requestServiceBtnText}>Request Field Services</Text>
             </TouchableOpacity>
          </View>
          <FlatList
            data={serviceRequests}
            keyExtractor={(item) => item.id}
            renderItem={renderServiceRequest}
            contentContainerStyle={{ padding: 20, paddingBottom: 60, paddingTop: 0 }}
            refreshControl={<RefreshControl refreshing={isLoading} onRefresh={() => fetchClientData(false)} tintColor={COLORS.accent} />}
            ListEmptyComponent={
              !isLoading ? (
                <View style={styles.emptyState}>
                  <Ionicons name="clipboard-outline" size={64} color={COLORS.border} />
                  <Text style={styles.emptyText}>No field services requested yet.</Text>
                </View>
              ) : null
            }
          />
        </View>
      )}

      {/* STOREFRONT TAB */}
      {activeTab === "store" && (
        <View style={{flex: 1}}>
          <View style={styles.searchContainer}>
            <Ionicons name="search" size={20} color={COLORS.textMuted} style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search for parts..."
              placeholderTextColor={COLORS.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery("")}>
                <Ionicons name="close-circle" size={20} color={COLORS.textMuted} />
              </TouchableOpacity>
            )}
          </View>
          <FlatList
            data={filteredCatalog}
            keyExtractor={(item) => item.id}
            renderItem={renderCatalogItem}
            contentContainerStyle={{ padding: 20, paddingBottom: 60, paddingTop: 10 }}
            refreshControl={<RefreshControl refreshing={isLoading} onRefresh={() => fetchClientData(false)} tintColor={COLORS.accent} />}
            ListEmptyComponent={
              !isLoading ? (
                <View style={styles.emptyState}>
                  <Ionicons name="pricetags-outline" size={64} color={COLORS.border} />
                  <Text style={styles.emptyText}>
                    {searchQuery ? "No matching parts found." : "Storefront is currently empty."}
                  </Text>
                </View>
              ) : null
            }
          />
        </View>
      )}

      {/* REQUEST FIELD SERVICE MODAL */}
      <Modal visible={showServiceModal} transparent={true} animationType="slide" onRequestClose={() => setShowServiceModal(false)}>
        <View style={styles.modalOverlayBackground}>
          <View style={[styles.actionSheetContent, { height: '85%' }]}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.actionSheetTitle}>Request Field Service</Text>
              <TouchableOpacity onPress={() => setShowServiceModal(false)}>
                <Ionicons name="close-circle" size={28} color={COLORS.textMuted} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.inputLabel}>Machine / Equipment Details</Text>
              <TextInput style={styles.input} placeholderTextColor={COLORS.textMuted} placeholder="e.g., CAT 320 Excavator" value={machineDetails} onChangeText={setMachineDetails} />
              
              <Text style={styles.inputLabel}>Exact Location</Text>
              <TextInput style={styles.input} placeholderTextColor={COLORS.textMuted} placeholder="e.g., Site 4, Nairobi Highway" value={location} onChangeText={setLocation} />
              
              <Text style={styles.inputLabel}>Issue Description</Text>
              <TextInput style={[styles.input, { height: 100, textAlignVertical: 'top' }]} placeholderTextColor={COLORS.textMuted} placeholder="Describe the breakdown..." value={issueDescription} onChangeText={setIssueDescription} multiline />
              
              <TouchableOpacity style={styles.modalSubmitButton} onPress={submitServiceRequest} disabled={isSubmittingRequest}>
                {isSubmittingRequest ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalSubmitButtonText}>Submit Request</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* CART & CHECKOUT MODAL */}
      <Modal visible={showCartModal} transparent={true} animationType="slide" onRequestClose={() => setShowCartModal(false)}>
        <View style={styles.modalOverlayBackground}>
          <View style={[styles.actionSheetContent, { height: '80%' }]}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.actionSheetTitle}>Your Cart</Text>
              <TouchableOpacity onPress={() => setShowCartModal(false)}>
                <Ionicons name="close-circle" size={28} color={COLORS.textMuted} />
              </TouchableOpacity>
            </View>
            
            {cart.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="cart-outline" size={64} color={COLORS.border} />
                <Text style={styles.emptyText}>Your cart is empty.</Text>
              </View>
            ) : (
              <>
                <FlatList
                  data={cart}
                  keyExtractor={(item) => item.id}
                  showsVerticalScrollIndicator={false}
                  renderItem={({ item }) => (
                    <View style={styles.cartItem}>
                      <View style={{flex: 1}}>
                        <Text style={styles.cartItemTitle}>{item.name}</Text>
                        <Text style={styles.cartItemPrice}>KES {item.price.toLocaleString()}  x  {item.qty}</Text>
                      </View>
                      <TouchableOpacity onPress={() => removeFromCart(item.id)} style={{padding: 10}}>
                        <Ionicons name="trash-outline" size={22} color={COLORS.danger} />
                      </TouchableOpacity>
                    </View>
                  )}
                />
                <View style={styles.checkoutFooter}>
                  <View style={{flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15}}>
                    <Text style={styles.checkoutTotalLabel}>Total Amount</Text>
                    <Text style={styles.checkoutTotalValue}>KES {calculateTotal().toLocaleString()}</Text>
                  </View>
                  <TouchableOpacity style={[styles.modalSubmitButton, {backgroundColor: COLORS.success}]} onPress={handleCheckout} disabled={isCheckingOut}>
                    {isCheckingOut ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalSubmitButtonText}>Secure Checkout</Text>}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* CUSTOM THEMED ALERT MODAL */}
      <Modal visible={alertConfig.visible} transparent={true} animationType="fade">
        <View style={[styles.modalOverlayBackground, {justifyContent: 'center', padding: 20}]}>
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
                <TouchableOpacity style={[styles.modalSubmitButton, {flex: 1, backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border}]} onPress={() => setAlertConfig({...alertConfig, visible: false})}>
                  <Text style={[styles.modalSubmitButtonText, {color: COLORS.textMain}]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.modalSubmitButton, {flex: 1, backgroundColor: COLORS.primary}]} onPress={alertConfig.onConfirm}>
                  <Text style={styles.modalSubmitButtonText}>Confirm</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={[styles.modalSubmitButton, {marginTop: 20}]} onPress={() => setAlertConfig({...alertConfig, visible: false})}>
                <Text style={styles.modalSubmitButtonText}>Acknowledge</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

      {/* EDIT PROFILE MODAL */}
      <Modal visible={showEditProfileModal} transparent={true} animationType="fade" onRequestClose={() => setShowEditProfileModal(false)}>
        <View style={styles.modalOverlayBackground}>
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
              <TouchableOpacity style={styles.modalSubmitButton} onPress={handleUpdateProfile} disabled={isUpdatingProfile}>
                {isUpdatingProfile ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalSubmitButtonText}>Save Changes</Text>}
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
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
  
  cartIconContainer: { position: 'relative' },
  cartBadge: { position: 'absolute', top: -5, right: -5, backgroundColor: COLORS.accent, borderRadius: 10, width: 20, height: 20, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: COLORS.surface },
  cartBadgeText: { color: COLORS.surface, fontSize: 10, fontWeight: '900' },

  segmentContainer: { flexDirection: "row", backgroundColor: COLORS.border, padding: 4, marginHorizontal: 20, borderRadius: 12, marginBottom: 10, marginTop: 10 },
  segmentBtn: { flex: 1, paddingVertical: 10, alignItems: "center", borderRadius: 10 },
  activeSegmentBtn: { backgroundColor: COLORS.surface, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },
  segmentText: { fontSize: 13, color: COLORS.textMuted, fontWeight: "700" },
  activeSegmentText: { color: COLORS.textMain, fontWeight: "900" },

  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface, marginHorizontal: 20, marginTop: 10, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border },
  searchIcon: { marginRight: 10 },
  searchInput: { flex: 1, paddingVertical: 14, fontSize: 16, color: COLORS.textMain },

  requestServiceBtn: { backgroundColor: COLORS.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, borderRadius: 12, shadowColor: COLORS.accent, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4 },
  requestServiceBtnText: { color: COLORS.surface, fontWeight: '900', fontSize: 16, textTransform: 'uppercase' },

  card: { backgroundColor: COLORS.surface, padding: 20, borderRadius: 16, marginBottom: 16, borderWidth: 1, borderColor: COLORS.border, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  machineTitle: { fontSize: 18, fontWeight: "800", color: COLORS.textMain, flex: 1 },
  
  clientStatusContainer: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 8, borderWidth: 1, marginBottom: 16 },
  clientStatusText: { fontSize: 14, fontWeight: "900", letterSpacing: 0.5 },

  metaTextLocation: { fontSize: 13, color: COLORS.textMuted, fontWeight: "600" },

  detailsContainer: { gap: 6, marginBottom: 16 },
  detailRow: { flexDirection: 'row', alignItems: 'center' },
  detailText: { fontSize: 14, color: COLORS.textMain, marginLeft: 8, fontWeight: '600' },

  issueContainer: { backgroundColor: COLORS.background, padding: 12, borderRadius: 8, borderLeftWidth: 3, borderLeftColor: COLORS.border },
  issueLabel: { fontSize: 11, fontWeight: "800", color: COLORS.textMuted, textTransform: "uppercase", marginBottom: 4, letterSpacing: 0.5 },
  issueText: { fontSize: 15, color: COLORS.textMain, lineHeight: 22 },

  catalogCard: { backgroundColor: COLORS.surface, borderRadius: 16, marginBottom: 16, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden', flexDirection: 'row', alignItems: 'center' },
  catalogImage: { width: 100, height: 100, backgroundColor: COLORS.background },
  catalogInfo: { flex: 1, padding: 16 },
  catalogTitle: { fontSize: 16, fontWeight: '800', color: COLORS.textMain, marginBottom: 4 },
  catalogPrice: { fontSize: 15, fontWeight: '900', color: COLORS.accent, marginBottom: 4 },
  catalogDesc: { fontSize: 12, color: COLORS.textMuted },
  addToCartBtn: { backgroundColor: COLORS.primary, padding: 16, justifyContent: 'center', alignItems: 'center' },

  emptyState: { alignItems: "center", paddingVertical: 60, justifyContent: 'center' },
  emptyText: { textAlign: "center", color: COLORS.textMuted, marginTop: 16, fontSize: 16, fontWeight: "600" },

  profileMenu: { position: "absolute", top: 70, right: 20, backgroundColor: COLORS.surface, borderRadius: 12, padding: 10, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 5, zIndex: 20, width: 180, borderWidth: 1, borderColor: COLORS.border },
  menuItem: { flexDirection: "row", alignItems: "center", paddingVertical: 12, paddingHorizontal: 8 },
  menuText: { marginLeft: 12, fontSize: 15, fontWeight: "700", color: COLORS.textMain },
  menuDivider: { height: 1, backgroundColor: COLORS.border, marginVertical: 4 },
  
  modalOverlayBackground: { flex: 1, backgroundColor: "rgba(15, 23, 42, 0.6)", justifyContent: "flex-end" },
  actionSheetContent: { backgroundColor: COLORS.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 24 },
  actionSheetTitle: { fontSize: 22, fontWeight: "900", color: COLORS.textMain, letterSpacing: -0.5 },
  modalHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  inputLabel: { fontSize: 14, fontWeight: '700', color: COLORS.textMain, marginBottom: 8, marginTop: 10 },
  input: { backgroundColor: COLORS.background, padding: 16, borderRadius: 12, marginBottom: 16, borderWidth: 1, borderColor: COLORS.border, fontSize: 16, color: COLORS.textMain },
  
  cartItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  cartItemTitle: { fontSize: 16, fontWeight: '800', color: COLORS.textMain, marginBottom: 4 },
  cartItemPrice: { fontSize: 14, color: COLORS.textMuted, fontWeight: '700' },
  checkoutFooter: { marginTop: 20, paddingTop: 20, borderTopWidth: 2, borderTopColor: COLORS.background },
  checkoutTotalLabel: { fontSize: 16, color: COLORS.textMuted, fontWeight: '700' },
  checkoutTotalValue: { fontSize: 22, color: COLORS.textMain, fontWeight: '900' },

  modalSubmitButton: { backgroundColor: COLORS.accent, padding: 16, borderRadius: 12, alignItems: "center", justifyContent: "center", marginTop: 10 },
  modalSubmitButtonText: { color: COLORS.surface, fontWeight: "800", fontSize: 15, textTransform: "uppercase" },

  customAlertBox: { backgroundColor: COLORS.surface, borderRadius: 20, padding: 24, width: '100%', shadowColor: "#000", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.15, shadowRadius: 20, elevation: 10 },
  customAlertTitle: { fontSize: 22, fontWeight: "900", color: COLORS.textMain, textAlign: 'center', marginBottom: 8 },
  customAlertMessage: { fontSize: 16, color: COLORS.textMuted, textAlign: 'center', lineHeight: 22 },
});