import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      if (window.location.pathname !== '/login' && window.location.pathname !== '/register') {
        window.location.href = '/login'
      }
    }

    // Registration approval gate. If the server refuses because the account is
    // not approved, drop the session and show the status screen instead of
    // leaving the user on a page they cannot use.
    const approvalStatus = error.response?.status === 403
      ? error.response?.data?.data?.status
      : null
    if (approvalStatus && approvalStatus !== 'Approved') {
      localStorage.removeItem('token')
      if (window.location.pathname !== '/account-status') {
        window.location.href = '/account-status'
      }
    }

    return Promise.reject(error)
  }
)

export default api
