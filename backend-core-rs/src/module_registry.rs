use crate::contracts::{
    AlarmLevel, EventTypeRegistration, PlatformModuleKind, PlatformModuleManifest,
};

pub fn built_in_platform_module_manifests() -> Vec<PlatformModuleManifest> {
    vec![
        PlatformModuleManifest {
            key: "workspace-admin".to_string(),
            name: "Workspace Administration".to_string(),
            version: "1.0.0".to_string(),
            kind: PlatformModuleKind::Infrastructure,
            description: Some(
                "Workspace bootstrap, overview, and scene management surfaces.".to_string(),
            ),
            owner: None,
            dependencies: vec![],
            schema_registrations: vec![],
            event_types: vec![],
            routes: vec![
                "overview".to_string(),
                "workspaces".to_string(),
                "scene".to_string(),
            ],
            permissions: vec!["workspace:read".to_string(), "workspace:write".to_string()],
        },
        PlatformModuleManifest {
            key: "entity-catalog".to_string(),
            name: "Entity Catalog".to_string(),
            version: "1.0.0".to_string(),
            kind: PlatformModuleKind::Domain,
            description: Some(
                "Entity, archetype, and schema-oriented modeling surfaces.".to_string(),
            ),
            owner: None,
            dependencies: vec![],
            schema_registrations: vec![
                "platform.entity-category".to_string(),
                "platform.entity-archetype".to_string(),
            ],
            event_types: vec![],
            routes: vec!["entities".to_string(), "archetypes".to_string()],
            permissions: vec!["entity:read".to_string(), "entity:write".to_string()],
        },
        PlatformModuleManifest {
            key: "runtime-integration".to_string(),
            name: "Runtime Integration".to_string(),
            version: "1.0.0".to_string(),
            kind: PlatformModuleKind::Infrastructure,
            description: Some(
                "Connectors, bindings, and runtime automation entry points.".to_string(),
            ),
            owner: None,
            dependencies: vec![],
            schema_registrations: vec![],
            event_types: vec![],
            routes: vec![
                "connectors".to_string(),
                "bindings".to_string(),
                "rules".to_string(),
            ],
            permissions: vec![
                "connector:read".to_string(),
                "connector:write".to_string(),
                "rule:write".to_string(),
            ],
        },
        PlatformModuleManifest {
            key: "governance-center".to_string(),
            name: "Governance Center".to_string(),
            version: "1.0.0".to_string(),
            kind: PlatformModuleKind::Domain,
            description: Some(
                "Alarm, event, and audit surfaces shared across vertical domains.".to_string(),
            ),
            owner: None,
            dependencies: vec![],
            schema_registrations: vec![],
            event_types: vec![
                "near_miss".to_string(),
                "zone_intrusion".to_string(),
                "overspeed".to_string(),
            ],
            routes: vec!["alarms".to_string(), "audit".to_string()],
            permissions: vec!["alarm:read".to_string(), "audit:read".to_string()],
        },
    ]
}

pub fn built_in_event_type_registrations() -> Vec<EventTypeRegistration> {
    vec![
        EventTypeRegistration {
            event_type: "near_miss".to_string(),
            module_key: "governance-center".to_string(),
            display_name: "险情接近".to_string(),
            default_severity: Some(AlarmLevel::Warning),
            supports_video: true,
            supports_timeline: true,
        },
        EventTypeRegistration {
            event_type: "zone_intrusion".to_string(),
            module_key: "governance-center".to_string(),
            display_name: "区域入侵".to_string(),
            default_severity: Some(AlarmLevel::Error),
            supports_video: true,
            supports_timeline: true,
        },
        EventTypeRegistration {
            event_type: "overspeed".to_string(),
            module_key: "governance-center".to_string(),
            display_name: "超速告警".to_string(),
            default_severity: Some(AlarmLevel::Warning),
            supports_video: false,
            supports_timeline: true,
        },
    ]
}
