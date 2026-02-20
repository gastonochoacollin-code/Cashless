=====================================================
CASHLESS SOCIAL
Sistema Cashless para Festivales, Eventos y Proyectos Sociales
=====================================================

Autor: Gastón Ochoa Collin  
Proyecto: Cashless Social  
Versión actual: Beta Operativa  
Stack principal: .NET 8 + API REST + NFC Readers + Frontend Web  
Ubicación actual de pruebas: Red local (IP privada)

-----------------------------------------------------
1. VISIÓN DEL PROYECTO
-----------------------------------------------------

Cashless Social es un sistema de pagos sin efectivo diseñado para:

- Festivales masivos
- Eventos culturales
- Centros comunitarios
- Comedores solidarios
- Proyectos sociales

Integra tecnología financiera con impacto social, permitiendo:

- Control total de consumo
- Reportes en tiempo real
- Seguridad operativa
- Transparencia financiera
- Posible integración con modelos solidarios (Telar)

No es solo un sistema de cobro.
Es una infraestructura financiera para comunidades y eventos conscientes.

-----------------------------------------------------
2. ARQUITECTURA GENERAL
-----------------------------------------------------

Componentes principales:

1) Cashless.Api (.NET 8)
   - API REST
   - Autenticación
   - Permisos por rol
   - Reportes
   - Gestión de barras
   - Gestión de productos
   - Gestión de usuarios
   - Endpoints para lector NFC

2) Cashless.NfcReader
   - Aplicación de escritorio
   - Lee tarjetas/pulseras NFC
   - Envía UID al servidor
   - Sincroniza saldo
   - Funciona en red local

3) Frontend Web
   - Panel admin
   - Sección barra
   - Subtotal y propina
   - Corte por turno (en desarrollo)
   - UX alineado a branding Cashless

-----------------------------------------------------
3. FUNCIONALIDADES IMPLEMENTADAS
-----------------------------------------------------

✔ Login de usuarios
✔ Sistema de roles
✔ Sistema de permisos (corriendo y limitando vistas)
✔ Gestión de productos
✔ Gestión de barras
✔ Cobro y descuento de saldo
✔ Reportes básicos
✔ API estable
✔ Swagger operativo
✔ Lector NFC leyendo UID correctamente
✔ Unificación de formato de lectura entre lectores

-----------------------------------------------------
4. FUNCIONALIDADES EN DESARROLLO
-----------------------------------------------------

• Sistema avanzado de reportes
• Cortes por turno por barra
• Generación automática de PDF para cortes
• Apertura y cierre de turno
• Control multi-barras más robusto
• Dashboard financiero avanzado
• UX principal con branding final
• Integración social (Cashless Solidario)

-----------------------------------------------------
5. SISTEMA DE PERMISOS
-----------------------------------------------------

Se implementó control por roles.

Actualmente:
- Admin: acceso completo
- Barra: acceso limitado a sección de cobro
- Otros roles: restringidos según configuración

Problema solucionado:
- Conflictos de rutas duplicadas en /api/permissions
- Errores de AmbiguousMatchException
- Carga infinita en frontend corregida

Estado: FUNCIONANDO.

-----------------------------------------------------
6. LECTOR NFC
-----------------------------------------------------

Configuración:
- .NET 8 requerido
- Ejecutar con dotnet run
- Lee UID de tarjeta o pulsera

Problema resuelto:
- Dos lectores enviaban formato distinto
- Se estandarizó la codificación
- Ahora ambos leen y envían el mismo UID

Arquitectura:
Lector → API → Validación de usuario → Descuento de saldo

-----------------------------------------------------
7. REPORTES
-----------------------------------------------------

Actualmente:
- Endpoint de summary
- Top products
- Datos generales de consumo

Problemas corregidos:
- Conflictos de rutas duplicadas
- AmbiguousMatchException

Pendiente:
- Reporte por barra
- Reporte por turno
- Exportación PDF
- Exportación Excel

-----------------------------------------------------
8. OPERACIÓN EN FESTIVALES
-----------------------------------------------------

Modelo operativo:

- Tarjetas o pulseras NFC
- Recarga previa
- Consumo en barras oficiales
- Corte por turno
- Reporte centralizado
- Control antifraude

Aplicación ideal:
Psy San Cris Trance 2026
San Cristóbal de las Casas
1–5 Abril 2026

Modelo cashless con tarjetas físicas recargables.

-----------------------------------------------------
9. FILOSOFÍA CASHLESS SOCIAL
-----------------------------------------------------

Cashless Social no solo busca eficiencia.

Busca:

- Transparencia
- Impacto comunitario
- Posibilidad de integrar fondos solidarios
- Integración con proyectos como Telar
- Potencial tokenización futura
- Ecosistema financiero para eventos conscientes

-----------------------------------------------------
10. CÓMO CORRER EL PROYECTO
-----------------------------------------------------

API:

dotnet run --urls http://0.0.0.0:5001

Acceso local:
http://IP_LOCAL:5001

Swagger:
http://IP_LOCAL:5001/swagger

Requisitos:
- .NET 8 SDK
- SQL configurado
- Cadena de conexión correcta

-----------------------------------------------------
11. ESTADO ACTUAL
-----------------------------------------------------

Sistema funcional en entorno local.
Permisos operativos.
Cobros funcionando.
Lectores sincronizados.

Falta:
- Escalar a entorno productivo
- Seguridad avanzada
- Testing masivo
- Deploy en servidor externo

-----------------------------------------------------
12. SIGUIENTE FASE
-----------------------------------------------------

1. Reportes profesionales
2. Cortes por turno con PDF
3. UX final con branding
4. Seguridad avanzada
5. Integración con festival real
6. Versión comercial para inversores

-----------------------------------------------------

CASHLESS SOCIAL
Infraestructura financiera para eventos conscientes.

En desarrollo activo.