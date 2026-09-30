import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImageManipulator from "expo-image-manipulator";
import { router } from "expo-router";
import { signOut, updatePassword } from "firebase/auth";
import {
    addDoc,
    collection,
    doc,
    getDoc,
    getDocs,
    limit,
    orderBy,
    query,
    serverTimestamp,
    updateDoc,
    where,
} from "firebase/firestore";
import { useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Image,
    KeyboardAvoidingView,
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
};

export default function MechanicPortal() {
  const [activeTab, setActiveTab] = useState<"requests" | "intake">("requests");
  const [userData, setUserData] = useState<any>(null);

  const [serviceRequests, setServiceRequests] = useState<any[]>([]);
  const [clientList, setClientList] = useState<any[]>([]);
  const [recentLogs, setRecentLogs] = useState<any[]>([]);
  
  const [isLoadingRequests, setIsLoadingRequests] = useState(false);
  const [isRefreshingRequests, setIsRefreshingRequests] = useState(false);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showManageModal, setShowManageModal] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<any>(null);

  const [showLogModal, setShowLogModal] = useState(false);
  const [mechanicLogText, setMechanicLogText] = useState("");
  const [isSubmittingLog, setIsSubmittingLog] = useState(false);

  const [showEditProfileModal, setShowEditProfileModal] = useState(false);
  const [editName, setEditName] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);

  const [componentType, setComponentType] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [selectedClient, setSelectedClient] = useState<any>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [isSubmittingIntake, setIsSubmittingIntake] = useState(false);
  const [showClientModal, setShowClientModal] = useState(false);

  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<any>(null);

  useEffect(() => {
    fetchUserData().then(() => {
      fetchClients();
      fetchServiceRequests(true);
      fetchRecentLogs();
    });
  }, []);

  const fetchUserData = async () => {
    if (auth.currentUser) {
      const userDoc = await getDoc(doc(db, "Users", auth.currentUser.uid));
      if (userDoc.exists()) setUserData(userDoc.data());
    }
  };

  const fetchClients = async () => {
    try {
      const q = query(collection(db, "Users"), where("role", "==", "client"));
      const snapshot = await getDocs(q);
      setClientList(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); }
  };

  const fetchServiceRequests = async (initialLoad = false) => {
    if (!auth.currentUser) return;
    if (initialLoad) setIsLoadingRequests(true);
    else setIsRefreshingRequests(true);
    
    try {
      const q = query(collection(db, "Service_Requests"), where("mechanicId", "==", auth.currentUser.uid));
      const snapshot = await getDocs(q);
      
      const data = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      data.sort((a: any, b: any) => {
        const timeA = a.timestamp?.toMillis() || 0;
        const timeB = b.timestamp?.toMillis() || 0;
        return timeB - timeA;
      });
      
      setServiceRequests(data);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingRequests(false);
      setIsRefreshingRequests(false);
    }
  };

  const fetchRecentLogs = async () => {
    setIsLoadingLogs(true);
    try {
      const q = query(collection(db, "Heavy_Components"), orderBy("timestamp", "desc"), limit(5));
      const snapshot = await getDocs(q);
      setRecentLogs(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); } finally { setIsLoadingLogs(false); }
  };

  const getClientDisplayName = (uid: string) => {
    const client = clientList.find((c) => c.id === uid);
    return client ? (client.fullName || client.username || client.email) : "Unknown Client";
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

  const pushStatusUpdate = async (newStatus: string) => {
    if (!selectedRequest) return;
    setShowManageModal(false);
    try {
      await updateDoc(doc(db, "Service_Requests", selectedRequest.id), { status: newStatus });
      fetchServiceRequests(false);
      
      if (newStatus === "awaiting_approval") {
        Alert.alert("Job Submitted", "Your repair log has been submitted to the Service Manager for final review and approval.");
      }
    } catch (error: any) {
      Alert.alert("Error", error.message);
    }
  };

  const submitMechanicLog = async () => {
    if (!selectedRequest || !mechanicLogText.trim()) return Alert.alert("Error", "Please write a diagnostic log.");
    setIsSubmittingLog(true);
    try {
      await updateDoc(doc(db, "Service_Requests", selectedRequest.id), {
        mechanicReport: mechanicLogText.trim()
      });
      setShowLogModal(false);
      setMechanicLogText("");
      fetchServiceRequests(false);
      Alert.alert("Success", "Diagnostic log saved.");
    } catch (error: any) {
      Alert.alert("Error", error.message);
    } finally {
      setIsSubmittingLog(false);
    }
  };

  const submitIntakeData = async () => {
    if (!componentType || !serialNumber || !selectedClient || !photoUri) return Alert.alert("Missing Data", "Fill all fields.");
    setIsSubmittingIntake(true);
    try {
      const manipResult = await ImageManipulator.manipulateAsync(photoUri, [{ resize: { width: 400 } }], { compress: 0.2, format: ImageManipulator.SaveFormat.JPEG, base64: true });
      await addDoc(collection(db, "Heavy_Components"), { clientId: selectedClient.id, componentType, serialNumber, intakePhotoBase64: `data:image/jpeg;base64,${manipResult.base64}`, status: "intake_complete", timestamp: serverTimestamp() });
      setComponentType(""); setSerialNumber(""); setSelectedClient(null); setPhotoUri(null);
      fetchRecentLogs();
    } catch (error: any) { Alert.alert("Database Error", error.message); } finally { setIsSubmittingIntake(false); }
  };

  const handleCapture = async () => {
    if (cameraRef.current) {
      const photo = await cameraRef.current.takePictureAsync();
      setPhotoUri(photo.uri);
      setIsCameraActive(false);
    }
  };

  const formatShortStatus = (status: string) => {
    if (status === "awaiting_approval") return "AWAITING MANAGER APPROVAL";
    if (status === "pending_review") return "PENDING REVIEW";
    if (status === "completed") return "COMPLETED";
    if (status === "mechanic_dispatched" || status === "dispatched") return "ACTIVE ASSIGNMENT";
    return status.replace(/_/g, " ").toUpperCase();
  };

  const getFirstName = () => {
    if (userData?.fullName) return userData.fullName.split(" ")[0];
    if (userData?.username) return userData.username;
    if (auth.currentUser?.email) return auth.currentUser.email.split("@")[0];
    return "Mechanic";
  };

  const renderRequestItem = ({ item }: { item: any }) => {
    const isCompleted = item.status === "completed";
    const isAwaitingApproval = item.status === "awaiting_approval";
    const isActive = item.status === "mechanic_dispatched" || item.status === "dispatched";
    
    let statusColor = COLORS.warning;
    if (isCompleted) statusColor = COLORS.success;
    if (isActive) statusColor = COLORS.primary;

    const timeString = item.timestamp ? new Date(item.timestamp.toDate()).toLocaleDateString() : "Just now";

    return (
      <View style={styles.inboxCard}>
        <View style={styles.inboxHeader}>
          <Text style={styles.inboxMachineTitle}>{item.machineDetails}</Text>
          <View style={[styles.statusPill, { backgroundColor: statusColor + "15", borderColor: statusColor + "40" }]}>
            <Text style={[styles.statusPillText, { color: statusColor }]}>{formatShortStatus(item.status)}</Text>
          </View>
        </View>

        <View style={styles.inboxMetaRow}>
          <Ionicons name="location" size={14} color={COLORS.textMuted} />
          <Text style={styles.inboxMetaText} numberOfLines={1}>{item.location}</Text>
          <Text style={styles.inboxMetaDot}>•</Text>
          <Ionicons name="time-outline" size={14} color={COLORS.textMuted} />
          <Text style={styles.inboxMetaText}>{timeString}</Text>
        </View>
        <Text style={styles.inboxClientText}>Client: {getClientDisplayName(item.clientId)}</Text>

        <View style={styles.issueContainer}>
          <Text style={styles.issueLabel}>Reported Issue</Text>
          <Text style={styles.issueText} numberOfLines={3}>{item.issueDescription}</Text>
        </View>

        {item.mechanicReport && (
          <View style={[styles.issueContainer, { backgroundColor: '#F0FDF4', borderLeftColor: COLORS.success, marginTop: -8 }]}>
            <Text style={[styles.issueLabel, { color: COLORS.success }]}>Your Diagnostic Log</Text>
            <Text style={[styles.issueText, { color: '#166534' }]} numberOfLines={3}>{item.mechanicReport}</Text>
          </View>
        )}

        {!isCompleted && !isAwaitingApproval && (
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.primaryActionBtn} onPress={() => { setSelectedRequest(item); setShowManageModal(true); }}>
              <Ionicons name="construct" size={16} color={COLORS.surface} style={{ marginRight: 6 }} />
              <Text style={styles.primaryActionText}>Update Job Status</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  if (!permission) return <View />;
  if (!permission.granted) return <View style={styles.container}><TouchableOpacity style={styles.submitButton} onPress={requestPermission}><Text style={styles.submitButtonText}>Grant Camera Permission</Text></TouchableOpacity></View>;
  if (isCameraActive) return (
    <View style={{ flex: 1 }}>
      <CameraView style={{ flex: 1 }} ref={cameraRef} />
      <View style={{ position: "absolute", bottom: 50, width: "100%", flexDirection: "row", justifyContent: "space-around", alignItems: "center" }}>
        <TouchableOpacity style={{ width: 70, height: 70, borderRadius: 35, backgroundColor: "white", borderWidth: 5, borderColor: COLORS.border }} onPress={handleCapture} />
        <TouchableOpacity style={{ padding: 15, backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 8 }} onPress={() => setIsCameraActive(false)}><Text style={{ color: "white", fontWeight: "bold" }}>Cancel</Text></TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.headerContainer}>
        <View>
          <Text style={styles.headerTitle}>Hi, {getFirstName()}</Text>
          <Text style={styles.welcomeText}>FIELD MECHANIC</Text>
        </View>
        <TouchableOpacity onPress={() => setShowProfileMenu(!showProfileMenu)}>
          <Ionicons name="person-circle" size={42} color={COLORS.primary} />
        </TouchableOpacity>
      </View>

      <View style={styles.pillTabBar}>
        <TouchableOpacity style={[styles.pillTab, activeTab === "requests" && styles.activePillTab]} onPress={() => setActiveTab("requests")}>
          <Text style={[styles.pillTabText, activeTab === "requests" && styles.activePillTabText]}>My Assignments</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={[styles.pillTab, activeTab === "intake" && styles.activePillTab]} onPress={() => setActiveTab("intake")}>
          <Text style={[styles.pillTabText, activeTab === "intake" && styles.activePillTabText]}>Hardware Intake</Text>
        </TouchableOpacity>
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

      <View style={{ flex: 1 }}>
        {activeTab === "requests" && (
          <FlatList
            data={serviceRequests}
            keyExtractor={(item) => item.id}
            renderItem={renderRequestItem}
            contentContainerStyle={{ padding: 20, paddingBottom: 60 }}
            refreshControl={<RefreshControl refreshing={isRefreshingRequests} onRefresh={() => fetchServiceRequests(false)} tintColor={COLORS.accent} />}
            ListHeaderComponent={
              <Text style={{color: COLORS.textMuted, marginBottom: 15, fontSize: 14, fontWeight: '500'}}>
                Pull down to sync assignments from dispatch.
              </Text>
            }
            ListEmptyComponent={
              !isLoadingRequests ? (
                <View style={styles.emptyState}>
                  <Ionicons name="construct-outline" size={64} color={COLORS.border} />
                  <Text style={styles.emptyText}>You have no active assignments.</Text>
                </View>
              ) : null
            }
          />
        )}

        {activeTab === "intake" && (
          <ScrollView contentContainerStyle={styles.formContainer}>
            <Text style={styles.sectionHeader}>Hardware Intake</Text>
            <TouchableOpacity style={styles.input} onPress={() => setShowClientModal(true)}>
              <Text style={{ color: selectedClient ? COLORS.textMain : COLORS.textMuted, fontSize: 16 }}>{selectedClient ? selectedClient.fullName || selectedClient.username || selectedClient.email : "Select Client Account"}</Text>
            </TouchableOpacity>
            <TextInput style={styles.input} placeholderTextColor={COLORS.textMuted} placeholder="Component Type" value={componentType} onChangeText={setComponentType} />
            <TextInput style={styles.input} placeholderTextColor={COLORS.textMuted} placeholder="Serial Number" value={serialNumber} onChangeText={setSerialNumber} />
            <TouchableOpacity style={styles.cameraTrigger} onPress={() => setIsCameraActive(true)}>
              <Ionicons name="camera" size={20} color={COLORS.primary} style={{ marginRight: 8 }} />
              <Text style={styles.cameraTriggerText}>{photoUri ? "Retake Photo" : "Launch Camera"}</Text>
            </TouchableOpacity>
            {photoUri && <Image source={{ uri: photoUri }} style={styles.previewImage} />}
            <TouchableOpacity style={styles.submitButton} onPress={submitIntakeData} disabled={isSubmittingIntake}>
              {isSubmittingIntake ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitButtonText}>Log Component Data</Text>}
            </TouchableOpacity>
            <View style={styles.divider} />
            <Text style={styles.sectionHeader}>Recent Intakes</Text>
            {isLoadingLogs ? <ActivityIndicator size="large" color={COLORS.accent} /> : recentLogs.map((item) => (
              <View key={item.id} style={styles.card}>
                <Text style={styles.cardTitle}>{item.componentType}</Text>
                <Text style={styles.detailText}>SN: {item.serialNumber}</Text>
                <Text style={styles.detailText}>Client: {getClientDisplayName(item.clientId)}</Text>
                {item.intakePhotoBase64 && <Image source={{ uri: item.intakePhotoBase64 }} style={[styles.previewImage, { marginTop: 12, marginBottom: 0 }]} />}
              </View>
            ))}
          </ScrollView>
        )}
      </View>

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

      <Modal visible={showManageModal} transparent={true} animationType="fade" onRequestClose={() => setShowManageModal(false)}>
        <TouchableOpacity style={styles.modalOverlayBackground} activeOpacity={1} onPress={() => setShowManageModal(false)}>
          <TouchableWithoutFeedback>
            <View style={styles.actionSheetContent}>
              <View style={styles.actionSheetHandle} />
              <Text style={styles.actionSheetTitle}>Assignment Details</Text>
              <Text style={styles.actionSheetSub}>{selectedRequest?.machineDetails}</Text>
              
              <View style={styles.modalIssueBox}>
                <Text style={styles.issueLabel}>Client Fault Report:</Text>
                <Text style={styles.issueText}>{selectedRequest?.issueDescription}</Text>
              </View>

              <TouchableOpacity style={styles.actionSheetBtn} onPress={() => {
                  setMechanicLogText(selectedRequest?.mechanicReport || "");
                  setShowManageModal(false); 
                  setShowLogModal(true); 
              }}>
                <Ionicons name="document-text-outline" size={22} color={COLORS.primary} />
                <Text style={styles.actionSheetBtnText}>Write Diagnostic Log</Text>
                <Ionicons name="chevron-forward" size={20} color={COLORS.textMuted} style={{marginLeft: 'auto'}}/>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.actionSheetBtn, { borderBottomWidth: 0 }]} onPress={() => pushStatusUpdate("awaiting_approval")}>
                <Ionicons name="shield-checkmark-outline" size={22} color={COLORS.warning} />
                <Text style={styles.actionSheetBtnText}>Submit to Manager for Review</Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </TouchableOpacity>
      </Modal>

      <Modal visible={showLogModal} transparent={true} animationType="slide" onRequestClose={() => setShowLogModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalOverlayBackground}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setShowLogModal(false)} />
          <View style={[styles.actionSheetContent, { paddingBottom: 40 }]}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.actionSheetTitle}>Diagnostic Log</Text>
              <TouchableOpacity onPress={() => setShowLogModal(false)}>
                <Ionicons name="close-circle" size={28} color={COLORS.textMuted} />
              </TouchableOpacity>
            </View>
            <TextInput 
              style={[styles.input, { height: 120, textAlignVertical: 'top' }]} 
              placeholderTextColor={COLORS.textMuted} 
              placeholder="Enter field diagnostics, parts used, and actions taken..." 
              value={mechanicLogText} 
              onChangeText={setMechanicLogText} 
              multiline 
            />
            <TouchableOpacity style={styles.submitButton} onPress={submitMechanicLog} disabled={isSubmittingLog}>
              {isSubmittingLog ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitButtonText}>Save Log</Text>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={showClientModal} transparent={true} animationType="slide">
        <View style={styles.modalOverlayBackground}>
          <View style={[styles.actionSheetContent, {height: '70%'}]}>
            <Text style={[styles.actionSheetTitle, {marginBottom: 15}]}>Select Client</Text>
            <FlatList
              data={clientList}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.clientListItem} onPress={() => { setSelectedClient(item); setShowClientModal(false); }}>
                  <Text style={{ fontWeight: "800", color: COLORS.textMain, fontSize: 16 }}>{item.fullName || "Unknown Name"}</Text>
                  <Text style={{ color: COLORS.textMuted, fontSize: 14 }}>@{item.username || item.email}</Text>
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity style={[styles.submitButton, { backgroundColor: COLORS.textMuted, marginTop: 16 }]} onPress={() => setShowClientModal(false)}>
              <Text style={styles.submitButtonText}>Cancel</Text>
            </TouchableOpacity>
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
  inboxCard: { backgroundColor: COLORS.surface, padding: 20, borderRadius: 16, marginBottom: 16, borderWidth: 1, borderColor: COLORS.border, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  inboxHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 },
  inboxMachineTitle: { fontSize: 18, fontWeight: "800", color: COLORS.textMain, flex: 1, paddingRight: 10 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1 },
  statusPillText: { fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },
  inboxMetaRow: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  inboxMetaText: { fontSize: 14, color: COLORS.textMuted, marginLeft: 4, maxWidth: "50%" },
  inboxMetaDot: { color: COLORS.border, marginHorizontal: 8, fontSize: 16 },
  inboxClientText: { fontSize: 14, color: COLORS.primary, fontWeight: "700", marginBottom: 8 },
  issueContainer: { marginBottom: 20, backgroundColor: COLORS.background, padding: 12, borderRadius: 8, borderLeftWidth: 3, borderLeftColor: COLORS.border },
  issueLabel: { fontSize: 11, fontWeight: "800", color: COLORS.textMuted, textTransform: "uppercase", marginBottom: 4, letterSpacing: 0.5 },
  issueText: { fontSize: 15, color: COLORS.textMain, lineHeight: 22 },
  actionRow: { borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 16 },
  primaryActionBtn: { backgroundColor: COLORS.primary, paddingVertical: 12, borderRadius: 10, flexDirection: "row", justifyContent: "center", alignItems: "center" },
  primaryActionText: { color: COLORS.surface, fontWeight: "800", fontSize: 14, letterSpacing: 0.5 },
  emptyText: { textAlign: "center", color: COLORS.textMuted, marginTop: 16, fontSize: 16, fontWeight: "600" },
  emptyState: { alignItems: "center", paddingVertical: 60, justifyContent: 'center' },
  modalOverlayBackground: { flex: 1, backgroundColor: "rgba(15, 23, 42, 0.6)", justifyContent: "flex-end" },
  actionSheetContent: { backgroundColor: COLORS.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 },
  actionSheetHandle: { width: 40, height: 5, backgroundColor: COLORS.border, borderRadius: 3, alignSelf: 'center', marginBottom: 20 },
  actionSheetTitle: { fontSize: 22, fontWeight: "900", color: COLORS.textMain, letterSpacing: -0.5 },
  actionSheetSub: { fontSize: 15, color: COLORS.textMuted, marginBottom: 15, fontWeight: "500" },
  modalIssueBox: { backgroundColor: COLORS.background, padding: 15, borderRadius: 10, marginBottom: 20, borderWidth: 1, borderColor: COLORS.border },
  actionSheetBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: COLORS.background },
  actionSheetBtnText: { fontSize: 16, fontWeight: "700", color: COLORS.textMain, marginLeft: 12 },
  modalHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  formContainer: { padding: 20 },
  sectionHeader: { fontSize: 20, fontWeight: "800", color: COLORS.textMain, marginBottom: 4, letterSpacing: -0.5 },
  input: { backgroundColor: COLORS.surface, padding: 16, borderRadius: 12, marginBottom: 16, borderWidth: 1, borderColor: COLORS.border, fontSize: 16, color: COLORS.textMain },
  submitButton: { backgroundColor: COLORS.accent, padding: 16, borderRadius: 12, alignItems: "center", shadowColor: COLORS.accent, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4 },
  submitButtonText: { color: COLORS.surface, fontWeight: "800", fontSize: 16, textTransform: "uppercase" },
  cameraTrigger: { backgroundColor: COLORS.background, padding: 16, borderRadius: 12, flexDirection: "row", justifyContent: "center", alignItems: "center", marginBottom: 16, borderWidth: 1, borderColor: COLORS.border },
  cameraTriggerText: { color: COLORS.primary, fontWeight: "800", fontSize: 16, textTransform: "uppercase" },
  previewImage: { width: "100%", height: 200, borderRadius: 12, resizeMode: "cover", marginBottom: 16 },
  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: 24 },
  card: { backgroundColor: COLORS.surface, padding: 20, borderRadius: 16, marginBottom: 16, borderWidth: 1, borderColor: COLORS.border, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  cardTitle: { fontSize: 18, fontWeight: "800", color: COLORS.textMain, marginBottom: 8 },
  detailText: { fontSize: 15, color: COLORS.textMuted, marginBottom: 6 },
  profileMenu: { position: "absolute", top: 70, right: 20, backgroundColor: COLORS.surface, borderRadius: 12, padding: 10, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 5, zIndex: 20, width: 220, borderWidth: 1, borderColor: COLORS.border },
  menuItem: { flexDirection: "row", alignItems: "center", paddingVertical: 12, paddingHorizontal: 8 },
  menuText: { marginLeft: 12, fontSize: 15, fontWeight: "700", color: COLORS.textMain },
  menuDivider: { height: 1, backgroundColor: COLORS.border, marginVertical: 4 },
  clientListItem: { padding: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: COLORS.background, borderRadius: 12, marginBottom: 8 },
});