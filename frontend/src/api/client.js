import axios from 'axios';

export const apiClient = axios.create({
  baseURL: '/api',
  timeout: 30000,
});

// Callback for handling 401 unauthorized
let onUnauthorizedCallback = null;

export function setOnUnauthorized(cb) {
  onUnauthorizedCallback = cb;
}

// Request interceptor to attach Bearer token
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('movalong_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

// Response interceptor to handle 401s
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      localStorage.removeItem('movalong_token');
      localStorage.removeItem('movalong_user');
      if (onUnauthorizedCallback) {
        onUnauthorizedCallback();
      }
    }
    return Promise.reject(error);
  }
);

// Auth endpoints
export async function registerApi(data) {
  const res = await apiClient.post('/auth/register', data);
  return res.data;
}

export async function loginApi(data) {
  const res = await apiClient.post('/auth/login', data);
  return res.data;
}

export async function getMeApi() {
  const res = await apiClient.get('/auth/me');
  return res.data;
}

// RFC endpoints
export async function listRfcsApi() {
  const res = await apiClient.get('/rfcs');
  return res.data;
}

export async function getRfcApi(rfcId) {
  const res = await apiClient.get(`/rfcs/${rfcId}`);
  return res.data;
}

export async function deleteRfcApi(rfcId) {
  const res = await apiClient.delete(`/rfcs/${rfcId}`);
  return res.data;
}

export async function uploadAudioApi(formData) {
  const res = await apiClient.post('/rfcs/upload-audio', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return res.data;
}

export async function getHealthApi() {
  const res = await apiClient.get('/health');
  return res.data;
}
