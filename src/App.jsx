// src/App.jsx
import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { supabase } from './lib/supabaseClient';
import './App.css';

// ---------- Job Options (Dropdown) ----------
const JOB_OPTIONS = [
  'Housemaid',
  'Driver',
  'Nurse',
  'Cook',
  'Domestic Worker',
  'Baby Sitter',
  'Teacher'
];

// ---------- Country Options (Dropdown) ----------
const COUNTRY_OPTIONS = [
  'Indonesia',
  'Sri Lanka',
  'Philippines',
  'Bangladesh',
  'India',
  'Ethiopia',
  'Kenya',
  'Uganda'
];

// 🔥 Hardcoded mapping for exact AI responses
const hardcodedJobMap = {
  'HOUSEMAID': 'Housemaid',
  'DRIVER': 'Driver',
  'NURSE': 'Nurse',
  'COOK': 'Cook',
  'DOMESTIC WORKER': 'Domestic Worker',
  'BABY SITTER': 'Baby Sitter',
  'TEACHER': 'Teacher'
};

const hardcodedCountryMap = {
  'INDONESIA': 'Indonesia',
  'SRI LANKAN': 'Sri Lanka',
  'PHILIPPINES': 'Philippines',
  'BANGLADESH': 'Bangladesh',
  'INDIA': 'India',
  'ETHIOPIA': 'Ethiopia',
  'KENYA': 'Kenya',
  'UGANDA': 'Uganda'
};

function App() {
  // ---------- State Variables ----------
  const [cvFile, setCvFile] = useState(null);
  const [profilePhotoFile, setProfilePhotoFile] = useState(null);
  const [profilePhotoPreview, setProfilePhotoPreview] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const [calculatedAge, setCalculatedAge] = useState(null);

  // Form Data
  const [formData, setFormData] = useState({
    full_name: '',
    date_of_birth: '',
    age: '',
    gender: '',
    marital_status: '',
    job_title: '',
    nationality: '',
    religion: '',
    salary: '',
    years_experience: '',
    worker_type: ''
  });

  // ---------- Helper Functions ----------

  const calculateAge = (dob) => {
    if (!dob) return null;
    const birthDate = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  // 🔥 Improved Job Mapping with hardcoded values
  const mapJob = (aiJob) => {
    if (!aiJob) return '';
    // Check hardcoded map first (case-insensitive)
    const upper = aiJob.toUpperCase().trim();
    if (hardcodedJobMap[upper]) {
      return hardcodedJobMap[upper];
    }
    // Fallback to normal mapping
    const normalized = aiJob.trim().toLowerCase();
    for (const job of JOB_OPTIONS) {
      if (job.toLowerCase() === normalized) {
        return job;
      }
      if (normalized.includes(job.toLowerCase()) || job.toLowerCase().includes(normalized)) {
        return job;
      }
    }
    console.warn('⚠️ Job not mapped:', aiJob);
    return '';
  };

  // 🔥 Improved Country Mapping with hardcoded values
  const mapCountry = (aiCountry) => {
    if (!aiCountry) return '';
    // Check hardcoded map first (case-insensitive)
    const upper = aiCountry.toUpperCase().trim();
    if (hardcodedCountryMap[upper]) {
      return hardcodedCountryMap[upper];
    }
    // Fallback to normal mapping
    const normalized = aiCountry.trim().toLowerCase();
    for (const country of COUNTRY_OPTIONS) {
      if (country.toLowerCase() === normalized) {
        return country;
      }
      if (normalized.includes(country.toLowerCase()) || country.toLowerCase().includes(normalized)) {
        return country;
      }
    }
    console.warn('⚠️ Country not mapped:', aiCountry);
    return '';
  };

  const mapWorkerType = (aiType) => {
    if (!aiType) return '';
    const lower = aiType.toLowerCase();
    if (lower.includes('first') || lower.includes('returned')) {
      return 'Returned Housemaids';
    }
    return 'Recruitment Workers';
  };

  const generateRef = () => {
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const random = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
    return `ZOD-${year}${month}${day}-${random}`;
  };

  const handleDobChange = (e) => {
    const dob = e.target.value;
    const age = calculateAge(dob);
    setCalculatedAge(age);
    setFormData(prev => ({
      ...prev,
      date_of_birth: dob,
      age: age !== null ? age.toString() : ''
    }));
  };

  const handleProfilePhotoChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setProfilePhotoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setProfilePhotoPreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  // ---------- AI Parser Call ----------
  const callAIParser = async (file) => {
    setIsParsing(true);
    setErrorMessage('');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      const response = await fetch(`${apiUrl}/parse-cv`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to parse CV');
      }

      const data = await response.json();
      console.log('AI Parsed Data:', data);

      let age = null;
      if (data.date_of_birth) {
        age = calculateAge(data.date_of_birth);
        setCalculatedAge(age);
      }

      // 🔥 Map AI values to dropdown values
      const mappedJob = mapJob(data.job_title);
      const mappedCountry = mapCountry(data.nationality);
      const mappedWorkerType = mapWorkerType(data.worker_type);

      console.log('✅ Mapped Job:', mappedJob);
      console.log('✅ Mapped Country:', mappedCountry);

      setFormData({
        full_name: data.full_name || '',
        date_of_birth: data.date_of_birth || '',
        age: age !== null ? age.toString() : '',
        gender: data.gender || '',
        marital_status: data.marital_status || '',
        job_title: mappedJob,
        nationality: mappedCountry,
        religion: data.religion || '',
        salary: data.salary?.toString() || '',
        years_experience: data.years_experience?.toString() || '',
        worker_type: mappedWorkerType
      });

      // Auto-extract photo from Base64 (if available)
      if (data.photo_base64) {
        try {
          const byteCharacters = atob(data.photo_base64);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          const blob = new Blob([byteArray], { type: 'image/jpeg' });
          const fileObj = new File([blob], 'profile_photo.jpg', { type: 'image/jpeg' });
          setProfilePhotoFile(fileObj);
          const reader = new FileReader();
          reader.onloadend = () => setProfilePhotoPreview(reader.result);
          reader.readAsDataURL(fileObj);
          console.log('✅ Photo auto-extracted from CV!');
        } catch (err) {
          console.log('Failed to parse photo base64:', err);
        }
      }

    } catch (error) {
      console.error('AI Parse Error:', error);
      setErrorMessage(`AI Parsing failed: ${error.message}`);
    } finally {
      setIsParsing(false);
    }
  };

  // ---------- Drag & Drop ----------
  const onDrop = useCallback((acceptedFiles) => {
    const file = acceptedFiles[0];
    if (!file) return;

    setCvFile(file);
    setIsUploading(true);
    setUploadProgress(0);
    setErrorMessage('');

    const interval = setInterval(() => {
      setUploadProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setIsUploading(false);
          callAIParser(file);
          return 100;
        }
        return prev + 10;
      });
    }, 150);
  }, []);

  // ---------- Form Input Change ----------
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // ---------- Submit to Supabase ----------
  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage('');

    try {
      let cvUrl = null;
      let photoUrl = null;

      // 1. Upload CV
      if (cvFile) {
        const fileExt = cvFile.name.split('.').pop();
        const fileName = `${Date.now()}_cv.${fileExt}`;
        const filePath = `cvs/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('zod_manpower')
          .upload(filePath, cvFile);

        if (uploadError) throw new Error(`CV Upload failed: ${uploadError.message}`);

        const { data: urlData } = supabase.storage
          .from('zod_manpower')
          .getPublicUrl(filePath);
        cvUrl = urlData.publicUrl;
      }

      // 2. Upload Photo
      if (profilePhotoFile) {
        const fileExt = profilePhotoFile.name.split('.').pop();
        const fileName = `${Date.now()}_photo.${fileExt}`;
        const filePath = `photos/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('zod_manpower')
          .upload(filePath, profilePhotoFile);

        if (uploadError) throw new Error(`Photo Upload failed: ${uploadError.message}`);

        const { data: urlData } = supabase.storage
          .from('zod_manpower')
          .getPublicUrl(filePath);
        photoUrl = urlData.publicUrl;
      }

      // 3. Insert into 'talents' table
      const ref = generateRef();

      console.log('📤 Submitting:', {
        job: formData.job_title,
        country: formData.nationality,
        name: formData.full_name
      });

      const { error: insertError } = await supabase
        .from('talents')
        .insert([{
          ref: ref,
          name: formData.full_name,
          dob: formData.date_of_birth || null,
          age: formData.age ? parseInt(formData.age) : null,
          gender: formData.gender || null,
          job: formData.job_title || null,
          country: formData.nationality || null,
          religion: formData.religion || null,
          salary: formData.salary ? parseInt(formData.salary) : null,
          experience: formData.years_experience || null,
          maritalStatus: formData.marital_status || null,
          workerType: formData.worker_type || null,
          pic: photoUrl || null,
          cv: cvUrl || null,
          created_at: new Date(),
          updated_at: new Date()
        }]);

      if (insertError) throw new Error(`Database insert failed: ${insertError.message}`);

      setSubmitted(true);
      setTimeout(() => setSubmitted(false), 4000);
      setTimeout(() => handleReset(), 500);

    } catch (error) {
      console.error('Submit Error:', error);
      setErrorMessage(`Submission failed: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ---------- Reset ----------
  const handleReset = () => {
    setFormData({
      full_name: '',
      date_of_birth: '',
      age: '',
      gender: '',
      marital_status: '',
      job_title: '',
      nationality: '',
      religion: '',
      salary: '',
      years_experience: '',
      worker_type: ''
    });
    setCvFile(null);
    setProfilePhotoFile(null);
    setProfilePhotoPreview(null);
    setUploadProgress(0);
    setSubmitted(false);
    setErrorMessage('');
    setCalculatedAge(null);
  };

  // ---------- Dropzone ----------
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png', '.webp']
    },
    maxFiles: 1,
    maxSize: 5242880
  });

  // ---------- Render ----------
  return (
    <div className="app-container">
      <header className="app-header">
        <div className="header-content">
          <div className="header-logo-wrapper">
            <img
              src="https://www.zodmanpower.info/logo/logo.jpeg"
              alt="ZOD Manpower Logo"
              className="header-logo"
              onError={(e) => { e.target.style.display = 'none'; }}
            />
            <div>
              <h1>ZOD <span>MANPOWER</span></h1>
              <p className="subtitle">RECRUITMENT · CV UPLOAD SYSTEM</p>
            </div>
          </div>
          <div className="badge">🚀 AI-Powered CV Parsing</div>
        </div>
      </header>

      <main className="main-content">
        {/* Upload Section */}
        <section className="upload-section">
          <div
            {...getRootProps()}
            className={`dropzone ${isDragActive ? 'active' : ''} ${cvFile ? 'has-file' : ''}`}
          >
            <input {...getInputProps()} />

            {!cvFile ? (
              <div className="dropzone-content">
                <div className="dropzone-icon">📄</div>
                <h3>Drop your CV (Image) here</h3>
                <p>or <span className="browse-link">browse files</span></p>
                <p className="file-types">Supports: JPG, PNG, WEBP (max 5MB)</p>
              </div>
            ) : (
              <div className="file-info">
                <span className="file-icon">📎</span>
                <span className="file-name">{cvFile.name}</span>
                <span className="file-size">
                  {(cvFile.size / 1024).toFixed(1)} KB
                </span>
                {isUploading && (
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${uploadProgress}%` }} />
                    <span className="progress-text">{uploadProgress}%</span>
                  </div>
                )}
                {isParsing && (
                  <div className="parsing-indicator">
                    <span className="spinner"></span>
                    AI is reading your CV...
                  </div>
                )}
              </div>
            )}
          </div>

          {cvFile && !isUploading && !isParsing && (
            <button className="btn-reset" onClick={() => { setCvFile(null); }} type="button">
              ✕ Remove CV
            </button>
          )}
        </section>

        {/* Profile Photo Upload */}
        <section className="photo-upload-section">
          <div className="photo-upload-container">
            <div>
              <label>🖼️ Profile Photo</label>
              <input type="file" accept="image/*" onChange={handleProfilePhotoChange} />
              <small>Upload manually or auto-extract from CV</small>
            </div>
            {profilePhotoPreview && (
              <div className="photo-preview-wrapper">
                <img src={profilePhotoPreview} alt="Profile Preview" className="photo-preview" />
                <button onClick={() => { setProfilePhotoFile(null); setProfilePhotoPreview(null); }}>Remove</button>
              </div>
            )}
          </div>
        </section>

        {/* Form Section */}
        <section className="form-section">
          <h2>Candidate Information</h2>
          <p className="form-hint">
            {isParsing ? '🔍 AI is extracting data...' :
             formData.full_name ? '✅ Data extracted! You can edit any field below before submitting.' :
             'Upload a CV to auto-fill the form'}
          </p>

          {errorMessage && (
            <div className="error-message">
              ❌ {errorMessage}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <div className="form-group full-width">
                <label>Full Name <span style={{ color: 'red' }}>*</span></label>
                <input type="text" name="full_name" value={formData.full_name} onChange={handleInputChange} placeholder="Enter full name" required />
                <small>Auto-filled, but you can edit</small>
              </div>

              <div className="form-group">
                <label>Date of Birth</label>
                <input type="date" name="date_of_birth" value={formData.date_of_birth} onChange={handleDobChange} />
                <small>Auto-filled, but you can edit</small>
              </div>

              <div className="form-group">
                <label>Age</label>
                <input type="number" name="age" value={formData.age} readOnly className="readonly-field" />
                {calculatedAge !== null && <small className="age-calc">✓ Calculated: {calculatedAge} years</small>}
              </div>

              <div className="form-group">
                <label>Gender</label>
                <select name="gender" value={formData.gender} onChange={handleInputChange}>
                  <option value="">Select</option>
                  <option value="MALE">Male</option>
                  <option value="FEMALE">Female</option>
                </select>
                <small>Auto-filled, but you can edit</small>
              </div>

              <div className="form-group">
                <label>Marital Status</label>
                <select name="marital_status" value={formData.marital_status} onChange={handleInputChange}>
                  <option value="">Select</option>
                  <option value="SINGLE">Single</option>
                  <option value="MARRIED">Married</option>
                  <option value="DIVORCED">Divorced</option>
                  <option value="WIDOWED">Widowed</option>
                </select>
                <small>Auto-filled, but you can edit</small>
              </div>

              <div className="form-group">
                <label>Nationality</label>
                <select name="nationality" value={formData.nationality} onChange={handleInputChange}>
                  <option value="">Select</option>
                  {COUNTRY_OPTIONS.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <small>Auto-mapped, but you can edit</small>
              </div>

              <div className="form-group">
                <label>Religion</label>
                <input type="text" name="religion" value={formData.religion} onChange={handleInputChange} placeholder="e.g., Buddhist" />
                <small>Auto-filled, but you can edit</small>
              </div>

              <div className="form-group">
                <label>Job Title</label>
                <select name="job_title" value={formData.job_title} onChange={handleInputChange}>
                  <option value="">Select</option>
                  {JOB_OPTIONS.map((j) => (
                    <option key={j} value={j}>{j}</option>
                  ))}
                </select>
                <small>Auto-mapped, but you can edit</small>
              </div>

              <div className="form-group">
                <label>Salary (QR)</label>
                <input type="number" name="salary" value={formData.salary} onChange={handleInputChange} placeholder="e.g., 1500" />
                <small>Auto-filled, but you can edit</small>
              </div>

              <div className="form-group">
                <label>Worker Type</label>
                <select name="worker_type" value={formData.worker_type} onChange={handleInputChange}>
                  <option value="">Select</option>
                  <option value="Recruitment Workers">Recruitment Workers</option>
                  <option value="Returned Housemaids">Returned Housemaids</option>
                </select>
                <small>Auto-mapped, but you can edit</small>
              </div>

              <div className="form-group full-width">
                <label>Years of Experience</label>
                <input type="number" name="years_experience" value={formData.years_experience} onChange={handleInputChange} placeholder="e.g., 0, 2, 5" min="0" max="50" step="1" />
                <small>Edit if needed</small>
              </div>
            </div>

            <div className="form-actions">
              <button type="submit" className="btn-submit" disabled={isSubmitting || !formData.full_name}>
                {isSubmitting ? 'Submitting...' : '🚀 Submit Candidate'}
              </button>
              <button type="button" className="btn-clear" onClick={handleReset}>
                Clear All
              </button>
            </div>
          </form>

          {submitted && (
            <div className="success-message">
              ✅ Candidate successfully submitted to Supabase!
            </div>
          )}
        </section>

        <footer className="app-footer">
          <p>© 2026 ZOD Manpower Recruitment · Powered by AI & Supabase</p>
        </footer>
      </main>
    </div>
  );
}

export default App;