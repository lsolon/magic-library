import { useAuth } from '../contexts/AuthContext';
import { BANDS, BandConfig } from './bands';

/** Configuração da faixa escolar do usuário logado. */
export function useBand(): BandConfig {
  const { band } = useAuth();
  return BANDS[band];
}
