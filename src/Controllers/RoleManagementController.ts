import * as utils from "util";

const db = require("../database");
const query = utils.promisify(db.query).bind(db);

// ============ ROLE MANAGEMENT (user_type_master) ============

export const roleManagement = {

  // GET /admin/roles?page=1&limit=10&search=
  async getAll(req, res) {
    try {
      const { page = 1, limit = 10, search = "" } = req.query;
      const offset = (Number(page) - 1) * Number(limit);

      let where = "WHERE utm.is_active = 1";
      const params: any[] = [];

      if (search) {
        where += " AND (utm.type_name LIKE ? OR utm.description LIKE ?)";
        params.push(`%${search}%`, `%${search}%`);
      }

      const roles = await query(
        `SELECT utm.*,
                COUNT(rmp.id) as menu_count
         FROM user_type_master utm
         LEFT JOIN role_menu_permissions rmp ON utm.id = rmp.role_id AND rmp.can_view = 1
         ${where}
         GROUP BY utm.id
         ORDER BY utm.id ASC
         LIMIT ? OFFSET ?`,
        [...params, Number(limit), offset]
      );

      const [{ total }] = await query(
        `SELECT COUNT(*) as total FROM user_type_master utm ${where}`,
        params
      );

      res.json({
        success: true,
        data: roles,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit)),
        },
      });
    } catch (error) {
      console.error("Get Roles Error:", error);
      res.status(500).json({ success: false, message: "Server error" });
    }
  },

  // GET /admin/roles/:id — single role with mapped menu items
  async getById(req, res) {
    try {
      const { id } = req.params;

      const [role] = await query(
        "SELECT * FROM user_type_master WHERE id = ? AND is_active = 1",
        [id]
      );
      if (!role) {
        return res.status(404).json({ success: false, message: "Role not found" });
      }

      const menus = await query(
        `SELECT mm.id, mm.menu_name, mm.menu_slug, mm.menu_icon, mm.parent_id,
                mm.sort_order, mm.route_path, mm.is_active,
                COALESCE(rmp.can_view,   0) as can_view,
                COALESCE(rmp.can_create, 0) as can_create,
                COALESCE(rmp.can_edit,   0) as can_edit,
                COALESCE(rmp.can_delete, 0) as can_delete
         FROM menu_master mm
         LEFT JOIN role_menu_permissions rmp
               ON mm.id = rmp.menu_id AND rmp.role_id = ?
         WHERE mm.is_active = 1
         ORDER BY mm.sort_order ASC`,
        [id]
      );

      res.json({ success: true, data: { ...role, menus } });
    } catch (error) {
      console.error("Get Role Error:", error);
      res.status(500).json({ success: false, message: "Server error" });
    }
  },

  // POST /admin/roles — create new role
  async create(req, res) {
    try {
      const { type_name, description, is_active = 1 } = req.body;

      if (!type_name) {
        return res.status(400).json({ success: false, message: "type_name is required" });
      }

      const [existing] = await query(
        "SELECT id FROM user_type_master WHERE type_name = ?",
        [type_name.toLowerCase()]
      );
      if (existing) {
        return res.status(400).json({ success: false, message: "Role name already exists" });
      }

      const result = await query(
        "INSERT INTO user_type_master (type_name, description, is_active) VALUES (?, ?, ?)",
        [type_name.toLowerCase(), description, is_active]
      );

      res.status(201).json({
        success: true,
        message: "Role created successfully",
        id: result.insertId,
      });
    } catch (error) {
      console.error("Create Role Error:", error);
      res.status(500).json({ success: false, message: "Server error" });
    }
  },

  // PUT /admin/roles/:id — update role
  async update(req, res) {
    try {
      const { id } = req.params;
      const { type_name, description, is_active } = req.body;

      const [existing] = await query(
        "SELECT id FROM user_type_master WHERE id = ?",
        [id]
      );
      if (!existing) {
        return res.status(404).json({ success: false, message: "Role not found" });
      }

      // Prevent renaming built-in roles 1 (user) and 2 (admin)
      if ((id == 1 || id == 2) && type_name) {
        return res.status(400).json({
          success: false,
          message: "Cannot rename built-in roles (user/admin)",
        });
      }

      const updates: string[] = [];
      const values: any[] = [];

      if (type_name !== undefined) { updates.push("type_name = ?");   values.push(type_name.toLowerCase()); }
      if (description !== undefined) { updates.push("description = ?"); values.push(description); }
      if (is_active !== undefined) { updates.push("is_active = ?");   values.push(is_active); }

      if (updates.length === 0) {
        return res.status(400).json({ success: false, message: "No fields to update" });
      }

      values.push(id);
      await query(
        `UPDATE user_type_master SET ${updates.join(", ")} WHERE id = ?`,
        values
      );

      res.json({ success: true, message: "Role updated successfully" });
    } catch (error) {
      console.error("Update Role Error:", error);
      res.status(500).json({ success: false, message: "Server error" });
    }
  },

  // DELETE /admin/roles/:id — soft delete (deactivate)
  async delete(req, res) {
    try {
      const { id } = req.params;

      if (id == 1 || id == 2) {
        return res.status(400).json({
          success: false,
          message: "Cannot delete built-in roles (user/admin)",
        });
      }

      const [existing] = await query(
        "SELECT id FROM user_type_master WHERE id = ?",
        [id]
      );
      if (!existing) {
        return res.status(404).json({ success: false, message: "Role not found" });
      }

      // Check if any staff users are assigned this role
      const [inUse] = await query(
        "SELECT COUNT(*) as cnt FROM users WHERE user_type_id = ?",
        [id]
      );
      if (inUse.cnt > 0) {
        return res.status(400).json({
          success: false,
          message: `Cannot delete role — ${inUse.cnt} user(s) are assigned to it`,
        });
      }

      await query("UPDATE user_type_master SET is_active = 0 WHERE id = ?", [id]);

      res.json({ success: true, message: "Role deactivated successfully" });
    } catch (error) {
      console.error("Delete Role Error:", error);
      res.status(500).json({ success: false, message: "Server error" });
    }
  },
};

// ============ MENU MANAGEMENT ============

export const menuManagement = {

  // GET /admin/menus — all menus (tree structure)
  async getAll(req, res) {
    try {
      const menus = await query(
        `SELECT mm.*, 
                pm.menu_name as parent_name
         FROM menu_master mm
         LEFT JOIN menu_master pm ON mm.parent_id = pm.id
         ORDER BY mm.sort_order ASC, mm.id ASC`
      );

      // Build tree
      const map: Record<number, any> = {};
      const tree: any[] = [];

      menus.forEach((m: any) => {
        map[m.id] = { ...m, children: [] };
      });
      menus.forEach((m: any) => {
        if (m.parent_id && map[m.parent_id]) {
          map[m.parent_id].children.push(map[m.id]);
        } else {
          tree.push(map[m.id]);
        }
      });

      res.json({ success: true, data: tree, flat: menus });
    } catch (error) {
      console.error("Get Menus Error:", error);
      res.status(500).json({ success: false, message: "Server error" });
    }
  },

  // GET /admin/menus/:id
  async getById(req, res) {
    try {
      const { id } = req.params;
      const [menu] = await query(
        `SELECT mm.*, pm.menu_name as parent_name
         FROM menu_master mm
         LEFT JOIN menu_master pm ON mm.parent_id = pm.id
         WHERE mm.id = ? AND mm.is_active = 1`,
        [id]
      );
      if (!menu) {
        return res.status(404).json({ success: false, message: "Menu not found" });
      }
      res.json({ success: true, data: menu });
    } catch (error) {
      console.error("Get Menu Error:", error);
      res.status(500).json({ success: false, message: "Server error" });
    }
  },

  // POST /admin/menus
  async create(req, res) {
    try {
      const { menu_name, menu_slug, menu_icon, parent_id, sort_order = 0, route_path, is_active = 1 } = req.body;

      if (!menu_name || !menu_slug) {
        return res.status(400).json({ success: false, message: "menu_name and menu_slug are required" });
      }

      const [slugExists] = await query(
        "SELECT id FROM menu_master WHERE menu_slug = ?",
        [menu_slug]
      );
      if (slugExists) {
        return res.status(400).json({ success: false, message: "menu_slug already exists" });
      }

      const result = await query(
        `INSERT INTO menu_master (menu_name, menu_slug, menu_icon, parent_id, sort_order, route_path, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [menu_name, menu_slug, menu_icon, parent_id || null, sort_order, route_path, is_active]
      );

      res.status(201).json({
        success: true,
        message: "Menu created successfully",
        id: result.insertId,
      });
    } catch (error) {
      console.error("Create Menu Error:", error);
      res.status(500).json({ success: false, message: "Server error" });
    }
  },

  // PUT /admin/menus/:id
  async update(req, res) {
    try {
      const { id } = req.params;
      const { menu_name, menu_slug, menu_icon, parent_id, sort_order, route_path, is_active } = req.body;

      const [existing] = await query("SELECT id FROM menu_master WHERE id = ?", [id]);
      if (!existing) {
        return res.status(404).json({ success: false, message: "Menu not found" });
      }

      if (menu_slug) {
        const [slugExists] = await query(
          "SELECT id FROM menu_master WHERE menu_slug = ? AND id != ?",
          [menu_slug, id]
        );
        if (slugExists) {
          return res.status(400).json({ success: false, message: "menu_slug already exists" });
        }
      }

      const updates: string[] = [];
      const values: any[] = [];

      if (menu_name !== undefined)  { updates.push("menu_name = ?");  values.push(menu_name); }
      if (menu_slug !== undefined)  { updates.push("menu_slug = ?");  values.push(menu_slug); }
      if (menu_icon !== undefined)  { updates.push("menu_icon = ?");  values.push(menu_icon); }
      if (parent_id !== undefined)  { updates.push("parent_id = ?");  values.push(parent_id || null); }
      if (sort_order !== undefined) { updates.push("sort_order = ?"); values.push(sort_order); }
      if (route_path !== undefined) { updates.push("route_path = ?"); values.push(route_path); }
      if (is_active !== undefined)  { updates.push("is_active = ?");  values.push(is_active); }

      if (updates.length === 0) {
        return res.status(400).json({ success: false, message: "No fields to update" });
      }

      values.push(id);
      await query(`UPDATE menu_master SET ${updates.join(", ")} WHERE id = ?`, values);

      res.json({ success: true, message: "Menu updated successfully" });
    } catch (error) {
      console.error("Update Menu Error:", error);
      res.status(500).json({ success: false, message: "Server error" });
    }
  },

  // DELETE /admin/menus/:id
  async delete(req, res) {
    try {
      const { id } = req.params;

      const [existing] = await query("SELECT id FROM menu_master WHERE id = ?", [id]);
      if (!existing) {
        return res.status(404).json({ success: false, message: "Menu not found" });
      }

      // Remove permissions first, then delete menu
      await query("DELETE FROM role_menu_permissions WHERE menu_id = ?", [id]);
      await query("DELETE FROM menu_master WHERE id = ?", [id]);

      res.json({ success: true, message: "Menu deleted successfully" });
    } catch (error) {
      console.error("Delete Menu Error:", error);
      res.status(500).json({ success: false, message: "Server error" });
    }
  },
};

// ============ ROLE-MENU PERMISSIONS ============

export const roleMenuPermissions = {

  // GET /admin/roles/:roleId/permissions — get all menu permissions for a role
  async getByRole(req, res) {
    try {
      const { roleId } = req.params;

      const [role] = await query(
        "SELECT id, type_name FROM user_type_master WHERE id = ?",
        [roleId]
      );
      if (!role) {
        return res.status(404).json({ success: false, message: "Role not found" });
      }

      const permissions = await query(
        `SELECT mm.id as menu_id, mm.menu_name, mm.menu_slug, mm.menu_icon,
                mm.parent_id, mm.sort_order, mm.route_path, mm.is_active,
                rmp.can_view, rmp.can_create, rmp.can_edit, rmp.can_delete,
                rmp.id as permission_id
         FROM menu_master mm
         INNER JOIN role_menu_permissions rmp
               ON mm.id = rmp.menu_id AND rmp.role_id = ?
         WHERE mm.is_active = 1
         ORDER BY mm.sort_order ASC`,
        [roleId]
      );

      // All menus (for the permissions UI — shows what's assigned vs not)
      const allMenus = await query(
        `SELECT mm.id as menu_id, mm.menu_name, mm.menu_slug, mm.menu_icon,
                mm.parent_id, mm.sort_order, mm.route_path, mm.is_active
         FROM menu_master mm
         WHERE mm.is_active = 1
         ORDER BY mm.sort_order ASC`
      );

      res.json({ success: true, data: { role, permissions, all_menus: allMenus } });
    } catch (error) {
      console.error("Get Role Permissions Error:", error);
      res.status(500).json({ success: false, message: "Server error" });
    }
  },

  // PUT /admin/roles/:roleId/permissions — bulk upsert permissions for a role
  // Body: { permissions: [{ menu_id, can_view, can_create, can_edit, can_delete }] }
  async updateByRole(req, res) {
    try {
      const { roleId } = req.params;
      const { permissions } = req.body;

      if (!Array.isArray(permissions) || permissions.length === 0) {
        return res.status(400).json({ success: false, message: "permissions array is required" });
      }

      const [role] = await query(
        "SELECT id FROM user_type_master WHERE id = ?",
        [roleId]
      );
      if (!role) {
        return res.status(404).json({ success: false, message: "Role not found" });
      }

      for (const perm of permissions) {
        const { menu_id, can_view = 0, can_create = 0, can_edit = 0, can_delete = 0 } = perm;

        await query(
          `INSERT INTO role_menu_permissions (role_id, menu_id, can_view, can_create, can_edit, can_delete)
           VALUES (?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             can_view   = VALUES(can_view),
             can_create = VALUES(can_create),
             can_edit   = VALUES(can_edit),
             can_delete = VALUES(can_delete),
             updated_at = CURRENT_TIMESTAMP`,
          [roleId, menu_id, can_view, can_create, can_edit, can_delete]
        );
      }

      // Increment permissions_version — forces all staff with this role to re-login
      await query(
        "UPDATE user_type_master SET permissions_version = permissions_version + 1 WHERE id = ?",
        [roleId]
      );

      res.json({ success: true, message: "Permissions updated successfully" });
    } catch (error) {
      console.error("Update Role Permissions Error:", error);
      res.status(500).json({ success: false, message: "Server error" });
    }
  },

  // DELETE /admin/roles/:roleId/permissions/:menuId — remove a single permission
  async deleteOne(req, res) {
    try {
      const { roleId, menuId } = req.params;

      await query(
        "DELETE FROM role_menu_permissions WHERE role_id = ? AND menu_id = ?",
        [roleId, menuId]
      );

      // Increment permissions_version — forces all staff with this role to re-login
      await query(
        "UPDATE user_type_master SET permissions_version = permissions_version + 1 WHERE id = ?",
        [roleId]
      );

      res.json({ success: true, message: "Permission removed successfully" });
    } catch (error) {
      console.error("Delete Permission Error:", error);
      res.status(500).json({ success: false, message: "Server error" });
    }
  },

  // GET /admin/menus/accessible?role_id=X — menus accessible by a role (for frontend sidebar)
  async getAccessibleMenus(req, res) {
    try {
      const { role_id } = req.query;

      if (!role_id) {
        return res.status(400).json({ success: false, message: "role_id is required" });
      }

      const menus = await query(
        `SELECT mm.id, mm.menu_name, mm.menu_slug, mm.menu_icon,
                mm.parent_id, mm.sort_order, mm.route_path,
                rmp.can_view, rmp.can_create, rmp.can_edit, rmp.can_delete
         FROM menu_master mm
         INNER JOIN role_menu_permissions rmp ON mm.id = rmp.menu_id
         WHERE rmp.role_id = ? AND rmp.can_view = 1 AND mm.is_active = 1
         ORDER BY mm.sort_order ASC`,
        [role_id]
      );

      // Build tree
      const map: Record<number, any> = {};
      const tree: any[] = [];

      menus.forEach((m: any) => { map[m.id] = { ...m, children: [] }; });
      menus.forEach((m: any) => {
        if (m.parent_id && map[m.parent_id]) {
          map[m.parent_id].children.push(map[m.id]);
        } else {
          tree.push(map[m.id]);
        }
      });

      res.json({ success: true, data: tree });
    } catch (error) {
      console.error("Get Accessible Menus Error:", error);
      res.status(500).json({ success: false, message: "Server error" });
    }
  },
};


