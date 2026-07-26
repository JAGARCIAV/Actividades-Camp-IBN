/**
 * auth.js
 * ------------------------------------------------------------------
 * Autenticación simple para el panel administrador.
 *
 * Es un candado básico pensado para uso interno del equipo de
 * campamento (no protege datos sensibles ni reemplaza un backend real).
 * La sesión vive en sessionStorage: se cierra sola al cerrar la pestaña.
 * ------------------------------------------------------------------
 */

const AuthService = (() => {
  const SESSION_KEY = 'camp2027_admin_session';
  const USUARIO = 'admin';
  const CLAVE = 'camp2027';

  function login(usuario, clave) {
    const ok = usuario === USUARIO && clave === CLAVE;
    if (ok) sessionStorage.setItem(SESSION_KEY, 'true');
    return ok;
  }

  function estaAutenticado() {
    return sessionStorage.getItem(SESSION_KEY) === 'true';
  }

  function logout() {
    sessionStorage.removeItem(SESSION_KEY);
  }

  return { login, estaAutenticado, logout };
})();
