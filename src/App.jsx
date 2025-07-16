import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, collection, addDoc, onSnapshot, query, where, deleteDoc, updateDoc, writeBatch, getDocs } from 'firebase/firestore';
import { ArrowRight, Plus, Upload, Utensils, X, Trash2, Edit, GlassWater, Minus, Home, Settings, AlertTriangle } from 'lucide-react';

// --- Configuration Firebase via les Variables d'Environnement ---
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const deploymentAppId = import.meta.env.VITE_DEPLOYMENT_APP_ID || 'default-app-id';

// --- Initialisation de Firebase ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- Fonctions d'aide ---
const getTodayDateString = () => new Date().toISOString().split('T')[0];

const calculateBMR = (weight, height, age, gender) => {
  if (gender === 'male') return 88.362 + (13.397 * weight) + (4.799 * height) - (5.677 * age);
  return 447.593 + (9.247 * weight) + (3.098 * height) - (4.330 * age);
};

const calculateTDEE = (bmr, activityLevel) => {
  const activityMultipliers = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, veryActive: 1.9 };
  return bmr * (activityMultipliers[activityLevel] || 1.2);
};

const adjustCaloriesForGoal = (tdee, goal) => {
    switch(goal) {
        case 'lose': return tdee * 0.85; // 15% deficit
        case 'gain': return tdee * 1.15; // 15% surplus
        default: return tdee; // maintain
    }
}

const getMacroTargets = (calories) => {
    const carbsCalories = calories * 0.4;
    const proteinCalories = calories * 0.3;
    const fatCalories = calories * 0.3;
    return {
        carbs: Math.round(carbsCalories / 4),
        protein: Math.round(proteinCalories / 4),
        fat: Math.round(fatCalories / 9),
    };
};

// --- Composants UI ---
const Spinner = () => <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500"></div>;

const Modal = ({ isOpen, onClose, children, title }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-center items-center p-4">
      <div className="bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md m-4 transform transition-all duration-300 scale-95 hover:scale-100">
        <div className="flex justify-between items-center p-5 border-b border-gray-700">
          <h3 className="text-xl font-semibold text-white">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors"><X size={24} /></button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
};

const ConfirmationModal = ({ isOpen, onClose, onConfirm, title, children }) => {
    if (!isOpen) return null;
    return (
        <Modal isOpen={isOpen} onClose={onClose} title={title}>
            <div className="text-white">
                {children}
                <div className="flex justify-end gap-4 mt-6">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-lg transition-colors">Annuler</button>
                    <button onClick={onConfirm} className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition-colors">Confirmer</button>
                </div>
            </div>
        </Modal>
    );
};

const ProfileForm = ({ initialData, onSubmit, buttonText, isLoading }) => {
    const [formData, setFormData] = useState(initialData);

    useEffect(() => {
        setFormData(initialData);
    }, [initialData]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        onSubmit(formData);
    };
    
    return (
         <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="block mb-2 text-sm font-medium text-gray-300">Taille (cm)</label>
                    <input type="number" name="height" value={formData.height} onChange={handleChange} className="w-full bg-gray-700 border border-gray-600 rounded-lg p-3 focus:ring-green-500 focus:border-green-500" placeholder="ex: 175" />
                </div>
                <div>
                    <label className="block mb-2 text-sm font-medium text-gray-300">Poids (kg)</label>
                    <input type="number" name="weight" value={formData.weight} onChange={handleChange} className="w-full bg-gray-700 border border-gray-600 rounded-lg p-3 focus:ring-green-500 focus:border-green-500" placeholder="ex: 70" />
                </div>
            </div>
            <div>
                <label className="block mb-2 text-sm font-medium text-gray-300">Âge</label>
                <input type="number" name="age" value={formData.age} onChange={handleChange} className="w-full bg-gray-700 border border-gray-600 rounded-lg p-3 focus:ring-green-500 focus:border-green-500" placeholder="ex: 30" />
            </div>
            <div>
                <label className="block mb-2 text-sm font-medium text-gray-300">Sexe</label>
                <select name="gender" value={formData.gender} onChange={handleChange} className="w-full bg-gray-700 border border-gray-600 rounded-lg p-3 focus:ring-green-500 focus:border-green-500">
                    <option value="female">Femme</option>
                    <option value="male">Homme</option>
                </select>
            </div>
            <div>
                <label className="block mb-2 text-sm font-medium text-gray-300">Niveau d'activité</label>
                <select name="activityLevel" value={formData.activityLevel} onChange={handleChange} className="w-full bg-gray-700 border border-gray-600 rounded-lg p-3 focus:ring-green-500 focus:border-green-500">
                    <option value="sedentary">Sédentaire</option><option value="light">Léger</option><option value="moderate">Modéré</option><option value="active">Actif</option><option value="veryActive">Très actif</option>
                </select>
            </div>
             <div>
                <label className="block mb-2 text-sm font-medium text-gray-300">Objectif</label>
                <select name="goal" value={formData.goal} onChange={handleChange} className="w-full bg-gray-700 border border-gray-600 rounded-lg p-3 focus:ring-green-500 focus:border-green-500">
                    <option value="lose">Perdre du poids</option><option value="maintain">Maintenir le poids</option><option value="gain">Prendre du poids</option>
                </select>
            </div>
            <button type="submit" disabled={isLoading} className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-lg transition-colors disabled:bg-gray-500 flex justify-center items-center">
                {isLoading ? <Spinner /> : buttonText}
            </button>
        </form>
    );
};


const ProfileSetup = ({ onProfileCreated }) => {
    const [isLoading, setIsLoading] = useState(false);
    const initialData = { height: '', weight: '', age: '', gender: 'female', activityLevel: 'sedentary', goal: 'maintain' };

    const handleSubmit = async (formData) => {
        setIsLoading(true);
        const { height, weight, age, gender, activityLevel, goal } = formData;
        if (!height || !weight || !age) {
            alert("Veuillez remplir tous les champs.");
            setIsLoading(false); return;
        }
        const bmr = calculateBMR(parseFloat(weight), parseFloat(height), parseInt(age), gender);
        const tdee = calculateTDEE(bmr, activityLevel);
        const calorieTarget = Math.round(adjustCaloriesForGoal(tdee, goal));
        const macroTargets = getMacroTargets(calorieTarget);
        const profileData = { ...formData, calorieTarget, ...macroTargets, createdAt: new Date() };

        try {
            const userId = auth.currentUser.uid;
            const profileRef = doc(db, "artifacts", deploymentAppId, "users", userId, "profile", "data");
            await setDoc(profileRef, profileData);
            onProfileCreated(profileData);
        } catch (error) {
            console.error("Erreur lors de la création du profil:", error);
            alert("Une erreur est survenue.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-gray-900 z-50 flex justify-center items-center p-4">
            <div className="bg-gray-800 p-8 rounded-2xl shadow-lg w-full max-w-lg text-white">
                 <h2 className="text-3xl font-bold text-center text-green-400 mb-2">Configurez votre profil</h2>
                 <p className="text-center text-gray-400 mb-6">Informations pour personnaliser votre expérience.</p>
                 <ProfileForm initialData={initialData} onSubmit={handleSubmit} buttonText="Enregistrer et commencer" isLoading={isLoading} />
            </div>
        </div>
    );
};

const CalorieCircle = ({ consumed, target }) => {
    const percentage = target > 0 ? Math.min((consumed / target) * 100, 100) : 0;
    const radius = 85; const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (percentage / 100) * circumference;
    return (
        <div className="relative w-64 h-64 flex items-center justify-center">
            <svg className="w-full h-full" viewBox="0 0 200 200">
                <circle cx="100" cy="100" r={radius} fill="none" stroke="#374151" strokeWidth="15" />
                <circle cx="100" cy="100" r={radius} fill="none" stroke="url(#gradient)" strokeWidth="15" strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} strokeLinecap="round" transform="rotate(-90 100 100)"/>
                <defs><linearGradient id="gradient" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stopColor="#10B981" /><stop offset="100%" stopColor="#34D399" /></linearGradient></defs>
            </svg>
            <div className="absolute text-center">
                <span className="text-5xl font-bold text-white">{Math.round(consumed)}</span>
                <p className="text-gray-400">/ {target} kcal</p>
            </div>
        </div>
    );
};

const MacroBar = ({ label, consumed, target, color }) => {
    const percentage = target > 0 ? Math.min((consumed / target) * 100, 100) : 0;
    return (
        <div className="w-full">
            <div className="flex justify-between items-baseline mb-1">
                <span className="text-sm font-medium text-white">{label}</span>
                <span className="text-xs text-gray-400">{Math.round(consumed)}g / {target}g</span>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-2.5"><div className={`${color} h-2.5 rounded-full`} style={{ width: `${percentage}%` }}></div></div>
        </div>
    );
};

const AddFoodModal = ({ isOpen, onClose, onFoodAction, isEditMode, initialData }) => {
    const [manualData, setManualData] = useState({ name: '', calories: '', carbs: '', protein: '', fat: '' });
    const [aiText, setAiText] = useState('');
    const [aiImage, setAiImage] = useState(null);
    const [aiImagePreview, setAiImagePreview] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [aiResult, setAiResult] = useState(null);
    const [mode, setMode] = useState('main');
    const fileInputRef = React.useRef(null);

    useEffect(() => {
        if (isEditMode && initialData) {
            setManualData({ name: initialData.name || '', calories: initialData.calories || '', carbs: initialData.carbs || '', protein: initialData.protein || '', fat: initialData.fat || '' });
            setMode('manual');
        } else {
             resetState();
        }
    }, [isOpen, isEditMode, initialData]);

    const resetState = () => {
        setMode('main');
        setManualData({ name: '', calories: '', carbs: '', protein: '', fat: '' });
        setAiText(''); setAiImage(null); setAiImagePreview(null); setIsLoading(false); setAiResult(null);
    };
    
    const handleClose = () => { resetState(); onClose(); };

    const handleManualSubmit = (e) => {
        e.preventDefault();
        const foodData = { name: manualData.name, calories: parseFloat(manualData.calories || 0), carbs: parseFloat(manualData.carbs || 0), protein: parseFloat(manualData.protein || 0), fat: parseFloat(manualData.fat || 0) };
        onFoodAction(foodData);
        handleClose();
    };

    const handleImageChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setAiImage(file);
            const reader = new FileReader();
            reader.onloadend = () => setAiImagePreview(reader.result);
            reader.readAsDataURL(file);
            setMode('ai-image-confirm');
        }
    };

    const analyzeWithAI = async () => {
        setIsLoading(true); setAiResult(null);
        
        const prompt = `You are an expert nutritionist. Analyze the following meal. Provide your best estimate for the meal's name, total calories, and macronutrients (carbohydrates, protein, fat) in grams. If portion size is unclear, assume a standard single serving. Your response MUST be a single, valid JSON object with no other text or explanations. The format is: {"name": "...", "calories": ..., "carbs": ..., "protein": ..., "fat": ...}. The meal is: `;
        
        let chatHistory = [];
        let parts = [];

        if (mode === 'ai-text' || (mode === 'ai-image-confirm' && aiText)) {
            parts.push({ text: prompt + aiText });
        } else if (mode === 'ai-image-confirm' && aiImage) {
            parts.push({ text: prompt });
            const reader = new FileReader();
            reader.readAsDataURL(aiImage);
            reader.onload = async () => {
                const base64ImageData = reader.result.split(',')[1];
                parts.push({ inlineData: { mimeType: "image/jpeg", data: base64ImageData } });
                chatHistory.push({ role: "user", parts: parts });
                await sendAIRequest(chatHistory);
            };
            reader.onerror = () => { setIsLoading(false); alert("Erreur de lecture de l'image."); };
            return;
        } else {
            setIsLoading(false);
            return;
        }
        
        chatHistory.push({ role: "user", parts: parts });
        await sendAIRequest(chatHistory);
    };

    const sendAIRequest = async (chatHistory) => {
        try {
            const apiKey = ""; 
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
            
            const payload = {
                contents: chatHistory,
                generationConfig: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: "OBJECT",
                        properties: {
                            "name": { "type": "STRING" },
                            "calories": { "type": "NUMBER" },
                            "carbs": { "type": "NUMBER" },
                            "protein": { "type": "NUMBER" },
                            "fat": { "type": "NUMBER" }
                        },
                    }
                }
            };

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`API error: ${response.statusText}`);
            }
            
            const result = await response.json();

            if (result.candidates && result.candidates.length > 0 && result.candidates[0].content && result.candidates[0].content.parts && result.candidates[0].content.parts.length > 0) {
                const jsonText = result.candidates[0].content.parts[0].text;
                setAiResult(JSON.parse(jsonText));
            } else {
                throw new Error("Invalid response structure from Gemini API");
            }

        } catch (error) {
            console.error("Erreur d'API IA:", error);
            alert("L'IA n'a pas pu analyser votre plat. Essayez une description plus détaillée.");
            setAiResult(null);
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleAiResultConfirm = () => { if(aiResult) { onFoodAction(aiResult); handleClose(); } };

    const renderContent = () => {
        if (isLoading) return <div className="flex flex-col items-center justify-center h-48 space-y-4"><Spinner /><p className="text-gray-300">L'IA analyse votre plat...</p></div>;
        if (aiResult) return (
            <div className="space-y-4 text-white">
                <h4 className="text-lg font-semibold text-center">Résultat de l'IA :</h4>
                <div className="bg-gray-700 p-4 rounded-lg space-y-2">
                    <p><strong>Plat :</strong> {aiResult.name}</p><p><strong>Calories :</strong> {Math.round(aiResult.calories || 0)} kcal</p><p><strong>Glucides :</strong> {Math.round(aiResult.carbs || 0)} g</p><p><strong>Protéines :</strong> {Math.round(aiResult.protein || 0)} g</p><p><strong>Lipides :</strong> {Math.round(aiResult.fat || 0)} g</p>
                </div>
                <p className="text-xs text-gray-400 text-center">Ces valeurs sont des estimations.</p>
                <div className="flex gap-4">
                    <button onClick={() => setAiResult(null)} className="w-full bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded-lg transition-colors">Retour</button>
                    <button onClick={handleAiResultConfirm} className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg transition-colors">Ajouter ce plat</button>
                </div>
            </div>
        );

        switch (mode) {
            case 'manual': return (
                <form onSubmit={handleManualSubmit} className="space-y-4">
                    <input type="text" name="name" placeholder="Nom du plat" value={manualData.name} onChange={(e) => setManualData({...manualData, name: e.target.value})} className="w-full bg-gray-700 border border-gray-600 rounded-lg p-3 text-white" required />
                    <div className="grid grid-cols-2 gap-4">
                        <input type="number" name="calories" placeholder="Calories (kcal)" value={manualData.calories} onChange={(e) => setManualData({...manualData, calories: e.target.value})} className="w-full bg-gray-700 border border-gray-600 rounded-lg p-3 text-white" required />
                        <input type="number" name="carbs" placeholder="Glucides (g)" value={manualData.carbs} onChange={(e) => setManualData({...manualData, carbs: e.target.value})} className="w-full bg-gray-700 border border-gray-600 rounded-lg p-3 text-white" />
                        <input type="number" name="protein" placeholder="Protéines (g)" value={manualData.protein} onChange={(e) => setManualData({...manualData, protein: e.target.value})} className="w-full bg-gray-700 border border-gray-600 rounded-lg p-3 text-white" />
                        <input type="number" name="fat" placeholder="Lipides (g)" value={manualData.fat} onChange={(e) => setManualData({...manualData, fat: e.target.value})} className="w-full bg-gray-700 border border-gray-600 rounded-lg p-3 text-white" />
                    </div>
                    <button type="submit" className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-lg transition-colors">{isEditMode ? 'Modifier le plat' : 'Ajouter manuellement'}</button>
                    {!isEditMode && <button type="button" onClick={() => setMode('main')} className="w-full text-center text-gray-400 hover:text-white mt-2">Retour</button>}
                </form>
            );
            case 'ai-text': return (
                <div className="space-y-4">
                    <textarea value={aiText} onChange={(e) => setAiText(e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-lg p-3 text-white" rows="3" placeholder="Ex: Un bol de riz avec du poulet grillé et des brocolis"></textarea>
                    <button onClick={analyzeWithAI} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg transition-colors">Analyser avec l'IA</button>
                    <button type="button" onClick={() => setMode('main')} className="w-full text-center text-gray-400 hover:text-white mt-2">Retour</button>
                </div>
            );
            case 'ai-image-confirm': return (
                <div className="space-y-4">
                    {aiImagePreview && <img src={aiImagePreview} alt="Aperçu du plat" className="rounded-lg max-h-64 mx-auto" />}
                    <p className="text-gray-300 text-center">Confirmez-vous l'analyse de cette image ?</p>
                    <input type="text" value={aiText} onChange={(e) => setAiText(e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-lg p-3 text-white" placeholder="Ajouter une description (optionnel)" />
                    <button onClick={analyzeWithAI} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg transition-colors">Analyser avec l'IA</button>
                    <button type="button" onClick={() => { setMode('main'); setAiImage(null); setAiImagePreview(null); setAiText(''); }} className="w-full text-center text-gray-400 hover:text-white mt-2">Annuler</button>
                </div>
            );
            default: return (
                <div className="space-y-4">
                    <input type="file" accept="image/*" onChange={handleImageChange} className="hidden" ref={fileInputRef} />
                    <button onClick={() => fileInputRef.current.click()} className="w-full flex items-center justify-center gap-3 bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 px-4 rounded-lg transition-colors"><Upload size={20} /> Importer une image</button>
                    <button onClick={() => setMode('ai-text')} className="w-full flex items-center justify-center gap-3 bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 px-4 rounded-lg transition-colors"><Utensils size={20} /> Décrire le plat à l'IA</button>
                    <div className="relative flex py-3 items-center"><div className="flex-grow border-t border-gray-600"></div><span className="flex-shrink mx-4 text-gray-400">ou</span><div className="flex-grow border-t border-gray-600"></div></div>
                    <button onClick={() => setMode('manual')} className="w-full flex items-center justify-center gap-3 bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 px-4 rounded-lg transition-colors"><ArrowRight size={20} /> Entrée manuelle</button>
                </div>
            );
        }
    };
    return <Modal isOpen={isOpen} onClose={handleClose} title={isEditMode ? "Modifier un plat" : "Ajouter un plat"}>{renderContent()}</Modal>;
};

const MealItem = ({ meal, onEdit, onDelete }) => (
    <div className="bg-gray-800 p-4 rounded-lg flex justify-between items-center">
        <div>
            <p className="font-semibold text-white">{meal.name}</p>
            <p className="text-sm text-gray-400">{Math.round(meal.calories)} kcal &bull; G: {Math.round(meal.carbs)}g P: {Math.round(meal.protein)}g L: {Math.round(meal.fat)}g</p>
        </div>
        <div className="flex items-center gap-3">
            <button onClick={() => onEdit(meal)} className="text-gray-400 hover:text-blue-400 transition-colors"><Edit size={18} /></button>
            <button onClick={() => onDelete(meal)} className="text-gray-400 hover:text-red-500 transition-colors"><Trash2 size={18} /></button>
        </div>
    </div>
);

const WaterTracker = ({ userId }) => {
    const [waterCount, setWaterCount] = useState(0);
    const today = getTodayDateString();
    const waterDocRef = useMemo(() => doc(db, "artifacts", deploymentAppId, "users", userId, "daily_stats", today), [userId, today]);

    useEffect(() => {
        const unsub = onSnapshot(waterDocRef, (doc) => {
            if (doc.exists()) setWaterCount(doc.data().waterCount || 0);
            else setWaterCount(0);
        });
        return () => unsub();
    }, [waterDocRef]);

    const updateWaterCount = async (newCount) => {
        const count = Math.max(0, newCount);
        setWaterCount(count);
        await setDoc(waterDocRef, { waterCount: count }, { merge: true });
    };

    return (
        <div className="bg-gray-800 p-4 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-3"><GlassWater className="text-blue-400" size={24} /><span className="text-white font-semibold">Eau : {(waterCount * 0.25).toFixed(2)} L</span></div>
            <div className="flex items-center gap-3">
                <button onClick={() => updateWaterCount(waterCount - 1)} className="bg-gray-700 rounded-full p-2 text-white hover:bg-gray-600 transition-colors"><Minus size={16} /></button>
                <span className="text-white w-8 text-center">{waterCount}</span>
                <button onClick={() => updateWaterCount(waterCount + 1)} className="bg-gray-700 rounded-full p-2 text-white hover:bg-gray-600 transition-colors"><Plus size={16} /></button>
            </div>
        </div>
    );
};

const HomePage = ({ userProfile, todaysMeals, onEditMeal, onDeleteMeal, userId }) => {
    const consumedTotals = useMemo(() => todaysMeals.reduce((acc, meal) => {
        acc.calories += meal.calories || 0; acc.carbs += meal.carbs || 0;
        acc.protein += meal.protein || 0; acc.fat += meal.fat || 0;
        return acc;
    }, { calories: 0, carbs: 0, protein: 0, fat: 0 }), [todaysMeals]);

    return (
        <main className="space-y-8">
            <div className="flex justify-center"><CalorieCircle consumed={consumedTotals.calories} target={userProfile.calorieTarget} /></div>
            <WaterTracker userId={userId} />
            <div className="grid grid-cols-3 gap-4 p-4 bg-gray-800 rounded-xl">
                <MacroBar label="Glucides" consumed={consumedTotals.carbs} target={userProfile.carbs} color="bg-blue-500" />
                <MacroBar label="Protéines" consumed={consumedTotals.protein} target={userProfile.protein} color="bg-red-500" />
                <MacroBar label="Lipides" consumed={consumedTotals.fat} target={userProfile.fat} color="bg-yellow-500" />
            </div>
            <div>
                <h2 className="text-2xl font-semibold mb-4 text-white">Repas du jour</h2>
                <div className="space-y-3">
                    {todaysMeals.length > 0 ? (
                        todaysMeals.map((meal) => <MealItem key={meal.id} meal={meal} onEdit={onEditMeal} onDelete={onDeleteMeal} />)
                    ) : (
                        <div className="text-center text-gray-500 py-10"><p>Aucun plat ajouté aujourd'hui.</p><p>Cliquez sur le '+' pour commencer.</p></div>
                    )}
                </div>
            </div>
        </main>
    );
};

const SettingsPage = ({ userProfile, onProfileUpdate, onDataDelete }) => {
    const [isLoading, setIsLoading] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

    const handleSubmit = async (formData) => {
        setIsLoading(true);
        const { height, weight, age, gender, activityLevel, goal } = formData;
        if (!height || !weight || !age) {
            alert("Veuillez remplir tous les champs.");
            setIsLoading(false); return;
        }
        const bmr = calculateBMR(parseFloat(weight), parseFloat(height), parseInt(age), gender);
        const tdee = calculateTDEE(bmr, activityLevel);
        const calorieTarget = Math.round(adjustCaloriesForGoal(tdee, goal));
        const macroTargets = getMacroTargets(calorieTarget);
        const profileData = { ...formData, calorieTarget, ...macroTargets };
        await onProfileUpdate(profileData);
        setIsLoading(false);
        alert("Profil mis à jour !");
    };
    
    const handleDeleteConfirm = () => {
        onDataDelete();
        setIsDeleteModalOpen(false);
    };

    return (
        <>
            <main className="space-y-8">
                <div>
                    <h2 className="text-2xl font-semibold mb-4 text-white">Modifier le Profil</h2>
                    <div className="bg-gray-800 p-6 rounded-xl">
                        <ProfileForm initialData={userProfile} onSubmit={handleSubmit} buttonText="Mettre à jour le profil" isLoading={isLoading} />
                    </div>
                </div>
                <div>
                    <h2 className="text-2xl font-semibold mb-4 text-red-500">Zone de Danger</h2>
                    <div className="bg-gray-800 p-6 rounded-xl flex justify-between items-center">
                        <div>
                            <h3 className="font-bold text-white">Supprimer toutes les données</h3>
                            <p className="text-sm text-gray-400">Cette action est irréversible.</p>
                        </div>
                        <button onClick={() => setIsDeleteModalOpen(true)} className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg transition-colors">
                            Supprimer
                        </button>
                    </div>
                </div>
            </main>
            <ConfirmationModal
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={handleDeleteConfirm}
                title="Supprimer les Données"
            >
                <p>Êtes-vous absolument sûr ? Toutes vos données de profil, de repas et de suivi d'eau seront définitivement effacées.</p>
                <p className="mt-2 font-bold text-red-400">Cette action ne peut pas être annulée.</p>
            </ConfirmationModal>
        </>
    );
};

// --- Composant Principal ---
export default function App() {
    const [userId, setUserId] = useState(null);
    const [userProfile, setUserProfile] = useState(null);
    const [todaysMeals, setTodaysMeals] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isAddFoodModalOpen, setAddFoodModalOpen] = useState(false);
    const [editingMeal, setEditingMeal] = useState(null);
    const [mealToDelete, setMealToDelete] = useState(null);
    const [isDeleteMealModalOpen, setDeleteMealModalOpen] = useState(false);
    const [currentPage, setCurrentPage] = useState('home');

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (user) {
                setUserId(user.uid);
                const profileRef = doc(db, "artifacts", deploymentAppId, "users", user.uid, "profile", "data");
                const profileDoc = await getDoc(profileRef);
                if (profileDoc.exists()) {
                    setUserProfile(profileDoc.data());
                }
                setIsLoading(false);
            } else {
                signInAnonymously(auth).catch(error => {
                    console.error("Anonymous sign-in failed", error);
                });
            }
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        if (!userId) return;
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
        const mealsCollectionRef = collection(db, "artifacts", deploymentAppId, "users", userId, "meals");
        const q = query(mealsCollectionRef, where("createdAt", ">=", today), where("createdAt", "<", tomorrow));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const mealsData = snapshot.docs.map(d => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt.toDate() }));
            setTodaysMeals(mealsData);
        }, (error) => console.error("Erreur de lecture des repas: ", error));
        return () => unsubscribe();
    }, [userId]);

    const handleFoodAction = async (foodData) => {
        if (!userId) return;
        if (editingMeal) {
            const mealRef = doc(db, "artifacts", deploymentAppId, "users", userId, "meals", editingMeal.id);
            await updateDoc(mealRef, foodData);
        } else {
            const mealsCollectionRef = collection(db, "artifacts", deploymentAppId, "users", userId, "meals");
            await addDoc(mealsCollectionRef, { ...foodData, createdAt: new Date() });
        }
    };

    const handleDeleteMealRequest = (meal) => {
        setMealToDelete(meal);
        setDeleteMealModalOpen(true);
    };

    const confirmDeleteMeal = async () => {
        if (!userId || !mealToDelete) return;
        const mealRef = doc(db, "artifacts", deploymentAppId, "users", userId, "meals", mealToDelete.id);
        await deleteDoc(mealRef);
        setDeleteMealModalOpen(false);
        setMealToDelete(null);
    };

    const handleProfileUpdate = async (newProfileData) => {
        if (!userId) return;
        const profileRef = doc(db, "artifacts", deploymentAppId, "users", userId, "profile", "data");
        await setDoc(profileRef, newProfileData, { merge: true });
        setUserProfile(newProfileData);
    };
    
    const handleDataDelete = async () => {
        if (!userId) return;
        const batch = writeBatch(db);
        const profileRef = doc(db, "artifacts", deploymentAppId, "users", userId, "profile", "data");
        const mealsRef = collection(db, "artifacts", deploymentAppId, "users", userId, "meals");
        const dailyStatsRef = collection(db, "artifacts", deploymentAppId, "users", userId, "daily_stats");
        
        batch.delete(profileRef);
        const mealsSnapshot = await getDocs(mealsRef);
        mealsSnapshot.forEach(doc => batch.delete(doc.ref));
        const dailyStatsSnapshot = await getDocs(dailyStatsRef);
        dailyStatsSnapshot.forEach(doc => batch.delete(doc.ref));
        
        await batch.commit();
        setUserProfile(null); // Triggers profile setup
    };

    const handleEditMeal = (meal) => { setEditingMeal(meal); setAddFoodModalOpen(true); };
    const openAddModal = () => { setEditingMeal(null); setAddFoodModalOpen(true); };
    const closeAddModal = () => { setAddFoodModalOpen(false); setEditingMeal(null); };
    
    if (isLoading) return <div className="bg-gray-900 min-h-screen flex items-center justify-center text-white"><Spinner /></div>;
    if (!userProfile) return <ProfileSetup onProfileCreated={(p) => setUserProfile(p)} />;

    return (
        <div className="bg-gray-900 min-h-screen text-white font-sans">
            <div className="container mx-auto max-w-2xl p-4 pb-28">
                <header className="text-center my-8"><h1 className="text-4xl font-bold text-green-400">NutriTrack AI</h1><p className="text-gray-400">Votre assistant nutritionnel personnel</p></header>
                {currentPage === 'home' && <HomePage userProfile={userProfile} todaysMeals={todaysMeals} onEditMeal={handleEditMeal} onDeleteMeal={handleDeleteMealRequest} userId={userId} />}
                {currentPage === 'settings' && <SettingsPage userProfile={userProfile} onProfileUpdate={handleProfileUpdate} onDataDelete={handleDataDelete} />}
            </div>
            
            <AddFoodModal isOpen={isAddFoodModalOpen} onClose={closeAddModal} onFoodAction={handleFoodAction} isEditMode={!!editingMeal} initialData={editingMeal} />
            <ConfirmationModal isOpen={isDeleteMealModalOpen} onClose={() => setDeleteMealModalOpen(false)} onConfirm={confirmDeleteMeal} title="Supprimer le Repas">
                <p>Êtes-vous sûr de vouloir supprimer ce repas : <strong>{mealToDelete?.name}</strong> ?</p>
            </ConfirmationModal>

            <div className="fixed bottom-0 left-0 right-0 bg-gray-800 bg-opacity-80 backdrop-blur-sm border-t border-gray-700">
                <div className="max-w-2xl mx-auto p-2 flex justify-around items-center">
                     <button onClick={() => setCurrentPage('home')} className={`p-3 rounded-full transition-colors ${currentPage === 'home' ? 'text-green-400' : 'text-gray-400 hover:text-white'}`}>
                        <Home size={28} />
                    </button>
                    <button onClick={openAddModal} className="bg-green-600 hover:bg-green-700 text-white rounded-full p-4 shadow-lg transform hover:scale-110 transition-transform -translate-y-4 border-4 border-gray-800">
                        <Plus size={32} />
                    </button>
                     <button onClick={() => setCurrentPage('settings')} className={`p-3 rounded-full transition-colors ${currentPage === 'settings' ? 'text-green-400' : 'text-gray-400 hover:text-white'}`}>
                        <Settings size={28} />
                    </button>
                </div>
            </div>
        </div>
    );
}
