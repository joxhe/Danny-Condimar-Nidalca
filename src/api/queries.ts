import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import type { Cliente, Linea, Pedido, Presupuesto, Producto } from '../domain/types';
import * as api from './client';
import {
  borrarPedidoLocal,
  guardarCatalogosLocal,
  guardarPedidosLocal,
  leerCatalogosLocal,
  leerPedidosLocal,
  upsertPedidoLocal,
} from '../db/dexie';

export const keys = {
  catalogos: ['catalogos'] as const,
  pedidos: ['pedidos'] as const,
  planeacion: ['planeacion'] as const,
};

const CATALOGOS_VACIOS: api.Catalogos = {
  clientes: { CONDIMAR: [], NIDALCA: [] },
  productos: { CONDIMAR: [], NIDALCA: [] },
  referencias: [],
};

/**
 * Cada query intenta la red y escribe el resultado en IndexedDB. Si la red
 * falla, cae al cache local en vez de propagar el error: el vendedor en ruta
 * sigue trabajando y la UI solo muestra el aviso de "sin conexion".
 */
export interface ResultadoCatalogos {
  /** Nunca es undefined: si no hay nada todavia, son listas vacias. */
  data: api.Catalogos;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  /** La red fallo y se esta sirviendo lo guardado en el dispositivo. */
  offline: boolean;
  refetch: () => void;
}

export function useCatalogos(): ResultadoCatalogos {
  const q = useQuery({
    queryKey: keys.catalogos,
    queryFn: async ({ signal }) => {
      try {
        const fresco = await api.fetchCatalogos(signal);
        await guardarCatalogosLocal(fresco);
        return { datos: fresco, offline: false };
      } catch (e) {
        const local = await leerCatalogosLocal();
        if (!local) throw e;
        return { datos: local, offline: true };
      }
    },
    staleTime: 5 * 60 * 1000,
  });

  return {
    data: q.data?.datos ?? CATALOGOS_VACIOS,
    isLoading: q.isLoading,
    isError: q.isError,
    error: q.error,
    offline: q.data?.offline ?? false,
    refetch: q.refetch,
  };
}

export function usePedidos(): UseQueryResult<Pedido[]> {
  return useQuery({
    queryKey: keys.pedidos,
    queryFn: async ({ signal }) => {
      try {
        const frescos = await api.fetchPedidos(signal);
        await guardarPedidosLocal(frescos);
        return frescos;
      } catch (e) {
        const locales = await leerPedidosLocal();
        if (locales.length === 0) throw e;
        return locales;
      }
    },
    staleTime: 60 * 1000,
    /*
     * Sin `initialData`.
     *
     * Pasarle [] hacia que TanStack Query lo tratara como dato recien traido:
     * con staleTime de un minuto lo daba por fresco y no consultaba la hoja,
     * asi que al recargar la pagina la lista salia vacia aunque hubiera
     * pedidos guardados. Los componentes ya ponen [] por defecto al leer.
     */
  });
}

export function useGuardarPedido() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (pedido: Pedido) => {
      await upsertPedidoLocal(pedido); // primero local: no se pierde si falla la red
      await api.guardarPedido(pedido);
      return pedido;
    },
    onSuccess: (pedido) => {
      qc.setQueryData<Pedido[]>(keys.pedidos, (prev = []) => [
        ...prev.filter((p) => p.id !== pedido.id),
        pedido,
      ]);
    },
  });
}

export function useEliminarPedido() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.eliminarPedido(id);
      await borrarPedidoLocal(id);
      return id;
    },
    onSuccess: (id) => {
      qc.setQueryData<Pedido[]>(keys.pedidos, (prev = []) =>
        prev.filter((p) => p.id !== id),
      );
    },
  });
}

export function useEliminarPedidos() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      await api.eliminarPedidos(ids);
      await Promise.all(ids.map(borrarPedidoLocal));
      return ids;
    },
    onSuccess: (ids) => {
      const fuera = new Set(ids);
      qc.setQueryData<Pedido[]>(keys.pedidos, (prev = []) =>
        prev.filter((p) => !fuera.has(p.id)),
      );
    },
  });
}

export function useGuardarClientes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ linea, datos }: { linea: Linea; datos: Cliente[] }) =>
      api.guardarClientes(linea, datos),
    onMutate: async ({ linea, datos }) => {
      qc.setQueryData<api.Catalogos>(keys.catalogos, (prev) =>
        prev ? { ...prev, clientes: { ...prev.clientes, [linea]: datos } } : prev,
      );
    },
  });
}

export function useGuardarProductos() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ linea, datos }: { linea: Linea; datos: Producto[] }) =>
      api.guardarProductos(linea, datos),
    onMutate: async ({ linea, datos }) => {
      qc.setQueryData<api.Catalogos>(keys.catalogos, (prev) =>
        prev ? { ...prev, productos: { ...prev.productos, [linea]: datos } } : prev,
      );
    },
  });
}

/** Cortes, presupuestos y comparativos: lo que el Informe necesita ademas de los pedidos. */
export function usePlaneacion() {
  return useQuery({
    queryKey: keys.planeacion,
    queryFn: ({ signal }) => api.fetchPlaneacion(signal),
    staleTime: 5 * 60 * 1000,
  });
}

/** Guarda el Informe ya calculado en la hoja, para que se vea desde el Sheet. */
export function useGuardarPresupuestos() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (datos: Presupuesto[]) => api.guardarPresupuestos(datos),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.planeacion }),
  });
}

export function useGuardarInforme() {
  return useMutation({
    mutationFn: ({ corteId, filas }: { corteId: string; filas: Record<string, unknown>[] }) =>
      api.guardarInforme(corteId, filas),
  });
}

export function useSiguienteNumero() {
  return useMutation({ mutationFn: (linea: Linea) => api.siguienteNumero(linea) });
}
