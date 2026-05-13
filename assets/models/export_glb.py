import bpy
import os
import numpy as np

output_path = os.path.join(os.path.dirname(bpy.data.filepath), "armi-pcb.glb")
base_dir = os.path.dirname(bpy.data.filepath)

print("=" * 60)
print("PCB Front/Back Texture Compositing & Export")
print("=" * 60)

# ============================================================
# STEP 1: Convert simple Mat4cad materials to Principled BSDF
# ============================================================
print("\n[Step 1] Converting simple Mat4cad materials...")

converted = 0
for mat in bpy.data.materials:
    if mat is None or not mat.node_tree:
        continue
    
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    
    has_images = any(n.type == 'TEX_IMAGE' for n in nodes)
    if has_images:
        continue
    
    custom_node = None
    output_node = None
    for node in nodes:
        if node.type == 'CUSTOM':
            custom_node = node
        elif node.type == 'OUTPUT_MATERIAL':
            output_node = node
    
    if not custom_node or not output_node:
        continue
    
    base_color = [0.5, 0.5, 0.5, 1.0]
    metallic = 0.0
    roughness = 0.5
    
    for inp in custom_node.inputs:
        name_lower = inp.name.lower()
        if 'color' in name_lower or 'base' in name_lower:
            try:
                val = list(inp.default_value)
                if len(val) >= 3:
                    base_color = val[:3] + [1.0]
            except:
                pass
        elif 'metallic' in name_lower:
            try: metallic = inp.default_value
            except: pass
        elif 'roughness' in name_lower:
            try: roughness = inp.default_value
            except: pass
    
    mat_name = mat.name.upper()
    avg_brightness = sum(base_color[:3]) / 3.0
    
    # Metallic parts: pins, solder, metals, and bright SHAPE materials (pin header posts)
    if any(k in mat_name for k in ['PIN', 'MET-', 'SOLDER', 'SHAPE_1.001', 'SHAPE_15', 'SHAPE_36', 'SHAPE_81', 'SHAPE_61', 'SHAPE_147']):
        metallic = 0.6
        roughness = 0.25
    elif mat_name.startswith('SHAPE_') and avg_brightness > 0.5:
        # Bright SHAPE = likely metal (pin header posts, connectors)
        metallic = 0.6
        roughness = 0.25
    elif 'RES' in mat_name:
        # Chip resistors — very matte to stay black under strong light
        metallic = 0.0
        roughness = 0.85
    elif 'IC-BODY' in mat_name:
        # IC bodies — matte plastic
        metallic = 0.0
        roughness = 0.6
    elif 'PLASTIC' in mat_name:
        # Plastic parts — slight sheen for realism
        metallic = 0.0
        roughness = 0.5
    
    # Gold color override for pin headers and connectors
    mat_exact = mat.name
    if mat_exact == 'PIN-02' or mat_exact == 'SHAPE_1.001':
        # Gold-plated pins — muted gold, high metallic
        base_color = [0.85, 0.72, 0.35, 1.0]
        metallic = 0.8
        roughness = 0.2
    elif mat_exact == 'PIN-01':
        # Tin/silver-plated pins
        base_color = [0.90, 0.90, 0.87, 1.0]
        metallic = 0.6
        roughness = 0.2
    
    nodes.remove(custom_node)
    
    principled = nodes.new('ShaderNodeBsdfPrincipled')
    principled.location = (0, 0)
    principled.inputs['Base Color'].default_value = base_color
    principled.inputs['Metallic'].default_value = metallic
    principled.inputs['Roughness'].default_value = roughness
    
    for link in list(links):
        if link.to_node == output_node:
            links.remove(link)
    
    links.new(principled.outputs['BSDF'], output_node.inputs['Surface'])
    converted += 1

print(f"  Converted {converted} simple materials")

# ============================================================
# STEP 2: Create front and back composited textures
# ============================================================
print("\n[Step 2] Compositing front & back PCB textures...")

cu_img = bpy.data.images.get('260513_pcb2blender_Cu.png')
mask_img = bpy.data.images.get('260513_pcb2blender_Mask.png')
silk_img = bpy.data.images.get('260513_pcb2blender_SilkS.png')

def composite_pcb_face(cu_data, mask_data, silk_data, w, h, channel_idx, face_name):
    """Composite a single PCB face (front or back) from layer channels."""
    cu_ch = cu_data[:, :, channel_idx]
    mask_ch = mask_data[:, :, channel_idx]
    silk_ch = silk_data[:, :, channel_idx] if silk_data is not None else np.zeros((h, w))
    
    # PCB color scheme
    pcb_green = np.array([0.0, 0.45, 0.20])           # Bare solder mask green
    pcb_green_trace = np.array([0.02, 0.32, 0.16])     # Darker green where copper runs under mask
    copper_color = np.array([0.72, 0.45, 0.20])         # Exposed copper
    hasl_color = np.array([0.78, 0.78, 0.72])           # HASL (tin) on pads
    silk_color = np.array([1.0, 1.0, 1.0])              # White silkscreen
    substrate_color = np.array([0.60, 0.55, 0.35])      # FR4 substrate
    
    result = np.zeros((h, w, 4), dtype=np.float32)
    result[:, :, 3] = 1.0
    
    # Start with substrate
    for c in range(3):
        result[:, :, c] = substrate_color[c]
    
    # Solder mask (green) where mask is present, no copper underneath
    mask_present = mask_ch > 0.5
    cu_present = cu_ch > 0.5
    mask_only = mask_present & (~cu_present)
    for c in range(3):
        result[:, :, c] = np.where(mask_only, pcb_green[c], result[:, :, c])
    
    # Copper UNDER mask — visible trace pattern (darker green tint)
    cu_under_mask = mask_present & cu_present
    for c in range(3):
        result[:, :, c] = np.where(cu_under_mask, pcb_green_trace[c], result[:, :, c])
    
    # Exposed copper/pads (no mask, has copper)
    exposed_pads = (~mask_present) & cu_present
    for c in range(3):
        result[:, :, c] = np.where(exposed_pads, hasl_color[c], result[:, :, c])
    
    # Silkscreen on top
    silk_present = silk_ch > 0.5
    for c in range(3):
        result[:, :, c] = np.where(silk_present, silk_color[c], result[:, :, c])
    
    print(f"  {face_name}: mask={np.sum(mask_present)}, cu={np.sum(cu_present)}, trace_under_mask={np.sum(cu_under_mask)}, silk={np.sum(silk_present)} pixels")
    return result

if cu_img and mask_img:
    w, h = cu_img.size[0], cu_img.size[1]
    print(f"  Image dimensions: {w}x{h}")
    
    cu_pixels = np.array(cu_img.pixels[:]).reshape(h, w, 4)
    mask_pixels = np.array(mask_img.pixels[:]).reshape(h, w, 4)
    silk_pixels = np.array(silk_img.pixels[:]).reshape(h, w, 4) if silk_img else None
    
    front_result = composite_pcb_face(cu_pixels, mask_pixels, silk_pixels, w, h, 0, "Front")
    back_result = composite_pcb_face(cu_pixels, mask_pixels, silk_pixels, w, h, 1, "Back")
    
    front_img = bpy.data.images.new("pcb_front", w, h)
    front_img.pixels = front_result.flatten().tolist()
    front_path = os.path.join(base_dir, "pcb_front.png")
    front_img.filepath_raw = front_path
    front_img.file_format = 'PNG'
    front_img.save()
    print(f"  Saved front texture: {front_path}")
    
    back_img = bpy.data.images.new("pcb_back", w, h)
    back_img.pixels = back_result.flatten().tolist()
    back_path = os.path.join(base_dir, "pcb_back.png")
    back_img.filepath_raw = back_path
    back_img.file_format = 'PNG'
    back_img.save()
    print(f"  Saved back texture: {back_path}")
else:
    print("  ERROR: Layer images not found!")
    front_img = None
    back_img = None

# ============================================================
# STEP 3: Split PCB mesh into front/back faces & assign materials
# ============================================================
print("\n[Step 3] Splitting PCB mesh into front/back faces...")

pcb_mat = bpy.data.materials.get('PCB_260513_pcb2blender')
pcb_obj = None

if pcb_mat:
    for obj in bpy.data.objects:
        if obj.type == 'MESH':
            for slot in obj.material_slots:
                if slot.material == pcb_mat:
                    pcb_obj = obj
                    break
            if pcb_obj:
                break

if pcb_obj and front_img and back_img:
    print(f"  Found PCB object: {pcb_obj.name}")
    
    # Create front material
    front_mat = bpy.data.materials.new(name="PCB_Front")
    front_mat.use_nodes = True
    fn = front_mat.node_tree.nodes
    fl = front_mat.node_tree.links
    for node in list(fn):
        fn.remove(node)
    tex_f = fn.new('ShaderNodeTexImage')
    tex_f.image = front_img
    tex_f.location = (-300, 0)
    prin_f = fn.new('ShaderNodeBsdfPrincipled')
    prin_f.location = (0, 0)
    prin_f.inputs['Roughness'].default_value = 0.45
    out_f = fn.new('ShaderNodeOutputMaterial')
    out_f.location = (300, 0)
    fl.new(tex_f.outputs['Color'], prin_f.inputs['Base Color'])
    fl.new(prin_f.outputs['BSDF'], out_f.inputs['Surface'])
    
    # Create back material
    back_mat = bpy.data.materials.new(name="PCB_Back")
    back_mat.use_nodes = True
    bn = back_mat.node_tree.nodes
    bl = back_mat.node_tree.links
    for node in list(bn):
        bn.remove(node)
    tex_b = bn.new('ShaderNodeTexImage')
    tex_b.image = back_img
    tex_b.location = (-300, 0)
    prin_b = bn.new('ShaderNodeBsdfPrincipled')
    prin_b.location = (0, 0)
    prin_b.inputs['Roughness'].default_value = 0.45
    out_b = bn.new('ShaderNodeOutputMaterial')
    out_b.location = (300, 0)
    bl.new(tex_b.outputs['Color'], prin_b.inputs['Base Color'])
    bl.new(prin_b.outputs['BSDF'], out_b.inputs['Surface'])
    
    # Create edge material (FR4 substrate)
    edge_mat = bpy.data.materials.new(name="PCB_Edge")
    edge_mat.use_nodes = True
    en = edge_mat.node_tree.nodes
    el = edge_mat.node_tree.links
    for node in list(en):
        en.remove(node)
    prin_e = en.new('ShaderNodeBsdfPrincipled')
    prin_e.location = (0, 0)
    prin_e.inputs['Base Color'].default_value = [0.60, 0.55, 0.35, 1.0]
    prin_e.inputs['Roughness'].default_value = 0.7
    out_e = en.new('ShaderNodeOutputMaterial')
    out_e.location = (300, 0)
    el.new(prin_e.outputs['BSDF'], out_e.inputs['Surface'])
    
    pcb_slot_idx = -1
    for i, slot in enumerate(pcb_obj.material_slots):
        if slot.material == pcb_mat:
            pcb_slot_idx = i
            break
    
    pcb_obj.data.materials.append(front_mat)
    front_idx = len(pcb_obj.material_slots) - 1
    pcb_obj.data.materials.append(back_mat)
    back_idx = len(pcb_obj.material_slots) - 1
    pcb_obj.data.materials.append(edge_mat)
    edge_idx = len(pcb_obj.material_slots) - 1
    
    import bmesh
    mesh = pcb_obj.data
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.faces.ensure_lookup_table()
    
    front_count = back_count = edge_count = 0
    UP_THRESHOLD = 0.7
    DOWN_THRESHOLD = -0.7
    
    for face in bm.faces:
        if face.material_index != pcb_slot_idx:
            continue
        nz = face.normal.z
        if nz > UP_THRESHOLD:
            face.material_index = front_idx
            front_count += 1
        elif nz < DOWN_THRESHOLD:
            face.material_index = back_idx
            back_count += 1
        else:
            face.material_index = edge_idx
            edge_count += 1
    
    bm.to_mesh(mesh)
    bm.free()
    
    print(f"  Front: {front_count}, Back: {back_count}, Edge: {edge_count}")
    print("  Materials assigned!")
else:
    print("  ERROR: PCB object or textures not found!")

# ============================================================
# STEP 4: Export to GLB
# ============================================================
print("\n[Step 4] Exporting to GLB...")

bpy.ops.export_scene.gltf(
    filepath=output_path,
    export_format='GLB',
    export_texcoords=True,
    export_normals=True,
    export_materials='EXPORT',
    export_image_format='AUTO',
    export_draco_mesh_compression_enable=False,
    use_selection=False,
    export_apply=True,
)

file_size = os.path.getsize(output_path)
print(f"\n[SUCCESS] {output_path}")
print(f"[SIZE] {file_size/1024/1024:.1f} MB")

for f in ['pcb_front.png', 'pcb_back.png']:
    p = os.path.join(base_dir, f)
    if os.path.exists(p):
        os.remove(p)
