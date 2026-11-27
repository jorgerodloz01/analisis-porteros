// Formularios de Tally que crea `sincronizar.mjs --crear-formularios`. Solo usa tipos de bloque documentados en la API
// (FORM_TITLE, TITLE, DROPDOWN_OPTION, INPUT_TEXT, TEXTAREA).
import { randomUUID } from 'node:crypto';

// Escala CR-10 de Foster para el RPE de sesión.
export const RPE_OPCIONES = ['0 · Reposo', '1 · Muy, muy suave', '2 · Suave', '3 · Moderada', '4 · Algo dura', '5 · Dura', '6', '7 · Muy dura', '8', '9', '10 · Máxima'];
// Mismas listas que CONFIG del Excel de monitorización.
export const MICROCICLOS = ['MD+1', 'MD+2', 'MD-5', 'MD-4', 'MD-3', 'MD-2', 'MD-1', 'MD', 'Sin partido'];
export const TIPOS = ['Campo', 'Gimnasio', 'Campo + gimnasio', 'Partido', 'Recuperación', 'Descanso', 'Otro'];

const bloque = (type, groupType, payload, groupUuid = randomUUID()) => ({ uuid: randomUUID(), type, groupUuid, groupType, payload });
const titulo = t => bloque('FORM_TITLE', 'TEXT', { html: t, title: t });
const pregunta = t => bloque('TITLE', 'QUESTION', { html: t });
const desplegable = opciones => {
  const g = randomUUID();
  return opciones.map((text, index) => bloque('DROPDOWN_OPTION', 'DROPDOWN', { index, isFirst: index === 0, isLast: index === opciones.length - 1, text }, g));
};
const linea = (placeholder, isRequired = false) => bloque('INPUT_TEXT', 'INPUT_TEXT', { isRequired, placeholder });
const area = placeholder => bloque('TEXTAREA', 'TEXTAREA', { isRequired: false, placeholder });

export const formularioRpe = porteros => ({
  status: 'PUBLISHED',
  blocks: [
    titulo("RPE de la sesión · FC L'Escala"),
    pregunta('Nombre'), ...desplegable(porteros),
    pregunta('¿Cómo de dura ha sido la sesión? (0-10)'), ...desplegable(RPE_OPCIONES),
    pregunta('Comentario (opcional)'), area('Molestias, cansancio, algo que deba saber…'),
  ],
});

export const formularioSesion = () => ({
  status: 'PUBLISHED',
  blocks: [
    titulo('Sesión del día · Jorge'),
    pregunta('Microciclo'), ...desplegable(MICROCICLOS),
    pregunta('Tipo de sesión'), ...desplegable(TIPOS),
    pregunta('Duración (minutos)'), linea('75', true),
    pregunta('Fecha (solo si no es hoy, dd/mm)'), linea('dd/mm'),
    pregunta('Observaciones (opcional)'), area(''),
  ],
});
