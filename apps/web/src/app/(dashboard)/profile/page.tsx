"use client"

import React, { useEffect, useState } from "react"
import { authApi } from "../../../features/auth/api"
import { SafeUser } from "@synergy/types"
import { Button, Card, Input, PageHeader } from "@synergy/ui"
import { Phone, Mail, ChevronDown, Edit2, X, UserX, Printer, Plus, Check } from "lucide-react"

export default function ProfilePage() {
  const [user, setUser] = useState<SafeUser | null>(null)
  const [activeTab, setActiveTab] = useState("General Info")
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [formValues, setFormValues] = useState({
    firstName: "",
    lastName: "",
    email: ""
  })

  useEffect(() => {
    let mounted = true
    authApi.currentUser().then(data => {
      if (mounted) {
        setUser(data)
        setFormValues({
          firstName: data.firstName || "",
          lastName: data.lastName || "",
          email: data.email || ""
        })
      }
    }).catch(console.error)
    return () => { mounted = false }
  }, [])

  const handleSave = async () => {
    try {
      setIsSaving(true)
      const updatedUser = await authApi.updateCurrentUser(formValues)
      setUser(updatedUser)
      setIsEditing(false)
    } catch (e) {
      console.error(e)
      alert("Failed to update profile")
    } finally {
      setIsSaving(false)
    }
  }

  if (!user) {
    return (
      <div className="p-8 flex items-center justify-center h-64 w-full flex-1">
        <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    )
  }

  const tabs = ["General Info", "Job", "Leave", "Notes", "Performance", "Permission"]

  return (
    <div className="flex-1 w-full overflow-y-auto bg-muted/20 p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="w-full space-y-6">
        <PageHeader 
          title="Employee Profile"
          description="Manage employee information, job details, and performance records."
          actions={
            <Button variant="outline" size="sm" className="font-semibold shadow-sm rounded-full">
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Add New
            </Button>
          }
        />

        {/* Main Profile Card */}
        <Card className="flex flex-col md:flex-row shadow-sm overflow-hidden p-0">
          {/* Left Side: Photo & Details */}
          <div className="flex p-6 gap-6 flex-1 border-r border-border min-w-0 bg-card">
            {/* Avatar */}
            <div className="w-24 h-24 sm:w-32 sm:h-32 shrink-0 bg-primary/10 rounded-2xl overflow-hidden relative border border-primary/20 flex items-center justify-center">
              <div className="text-4xl sm:text-5xl text-primary font-bold uppercase">
                {user.firstName?.charAt(0) || user.name?.charAt(0) || "U"}
              </div>
            </div>

            {/* Details */}
            <div className="flex flex-col justify-center gap-1.5 min-w-0">
              <h2 className="text-2xl font-bold truncate text-foreground">
                {user.firstName && user.lastName 
                  ? `${user.firstName} ${user.lastName}`
                  : user.name || "User"}
              </h2>
              <p className="text-sm font-medium text-muted-foreground bg-muted/50 px-2.5 py-1 rounded-full w-fit mt-1">
                {user.title || "Business Executive"} • {user.department || "Sales Department"}
              </p>
              <div className="mt-3 space-y-2">
                <a href={`mailto:${user.email}`} className="text-sm font-medium text-foreground hover:text-primary transition-colors flex items-center gap-2">
                  <div className="p-1 bg-muted rounded-md"><Mail className="w-3.5 h-3.5 text-muted-foreground" /></div>
                  {user.email}
                </a>
                <div className="text-sm font-medium text-foreground flex items-center gap-2">
                  <div className="p-1 bg-muted rounded-md"><Phone className="w-3.5 h-3.5 text-muted-foreground" /></div>
                  {user.phone || "Not provided"}
                </div>
              </div>
            </div>
          </div>

          {/* Right Side: Actions */}
          <div className="p-6 flex flex-col items-start md:items-end justify-center min-w-[240px] bg-muted/30">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-4">Quick Actions</p>
            <div className="flex flex-col w-full gap-2">
              {!isEditing ? (
                <Button onClick={() => setIsEditing(true)} size="sm" className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-semibold shadow-sm justify-start">
                  <Edit2 className="w-4 h-4 mr-2" /> Edit Profile
                </Button>
              ) : (
                <div className="flex gap-2 w-full">
                  <Button onClick={handleSave} disabled={isSaving} size="sm" className="flex-1 bg-emerald-600 text-white hover:bg-emerald-700 font-semibold shadow-sm">
                    {isSaving ? "Saving..." : <><Check className="w-4 h-4 mr-1.5" /> Save</>}
                  </Button>
                  <Button onClick={() => {
                    setIsEditing(false)
                    setFormValues({
                      firstName: user.firstName || "",
                      lastName: user.lastName || "",
                      email: user.email || ""
                    })
                  }} disabled={isSaving} size="sm" variant="outline" className="flex-1 bg-card text-foreground">
                    <X className="w-4 h-4 mr-1.5" /> Cancel
                  </Button>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2 w-full mt-2">
                <Button size="sm" variant="outline" className="w-full bg-card hover:text-destructive hover:border-destructive/50 transition-colors shadow-sm text-xs px-0">
                  <UserX className="w-3.5 h-3.5 mr-1" /> Terminate
                </Button>
                <Button size="sm" variant="outline" className="w-full bg-card shadow-sm text-xs px-0">
                  <Printer className="w-3.5 h-3.5 mr-1" /> Print
                </Button>
              </div>
            </div>
          </div>
        </Card>

        {/* Tabs */}
        <div className="flex items-center border-b border-border overflow-x-auto no-scrollbar">
          {tabs.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-3 text-sm font-bold whitespace-nowrap border-b-2 transition-all ${
                activeTab === tab
                  ? "border-primary text-primary bg-primary/5"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="pt-2">
          {activeTab === "General Info" && (
            <div className="space-y-6">
              
              {/* Basic Info */}
              <Card className="rounded-xl border border-border bg-card shadow-sm overflow-hidden p-0">
                <div className="bg-muted/30 px-6 py-4 border-b border-border flex justify-between items-center cursor-pointer hover:bg-muted/50 transition-colors">
                  <h3 className="text-sm font-bold text-foreground">Basic Information</h3>
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-y-6 gap-x-12 text-sm">
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">First Name</span>
                    {isEditing ? (
                      <Input 
                        className="h-10 bg-muted/40 rounded-full border-border/50 px-4 focus-visible:ring-primary/20 focus-visible:border-primary" 
                        value={formValues.firstName} 
                        onChange={(e) => setFormValues({...formValues, firstName: e.target.value})} 
                      />
                    ) : (
                      <span className="font-semibold text-foreground">{user.firstName || "-"}</span>
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Last Name</span>
                    {isEditing ? (
                      <Input 
                        className="h-10 bg-muted/40 rounded-full border-border/50 px-4 focus-visible:ring-primary/20 focus-visible:border-primary" 
                        value={formValues.lastName} 
                        onChange={(e) => setFormValues({...formValues, lastName: e.target.value})} 
                      />
                    ) : (
                      <span className="font-semibold text-foreground">{user.lastName || "-"}</span>
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Employee ID</span>
                    <span className="font-semibold text-foreground">{user.employeeId || "-"}</span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Email Address</span>
                    {isEditing ? (
                      <Input 
                        className="h-10 bg-muted/40 rounded-full border-border/50 px-4 focus-visible:ring-primary/20 focus-visible:border-primary" 
                        value={formValues.email} 
                        onChange={(e) => setFormValues({...formValues, email: e.target.value})} 
                      />
                    ) : (
                      <a href={`mailto:${user.email}`} className="font-semibold text-primary hover:underline">
                        {user.email}
                      </a>
                    )}
                  </div>
                </div>
              </Card>

              {/* Work Info */}
              <Card className="rounded-xl border border-border bg-card shadow-sm overflow-hidden p-0">
                <div className="bg-muted/30 px-6 py-4 border-b border-border flex justify-between items-center cursor-pointer hover:bg-muted/50 transition-colors">
                  <h3 className="text-sm font-bold text-foreground">Work Details</h3>
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-y-6 gap-x-12 text-sm">
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Department</span>
                    <span className="font-semibold text-foreground">{user.department || "-"}</span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Title</span>
                    <span className="font-semibold text-foreground">{user.title || "-"}</span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Reporting To</span>
                    <span className="font-semibold text-foreground">-</span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Date of Hire</span>
                    <span className="font-semibold text-foreground">
                      {user.dateOfHire ? new Date(user.dateOfHire).toISOString().split('T')[0] : "-"}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Source of Hire</span>
                    <span className="font-semibold text-foreground">Direct</span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Status</span>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-600 w-fit">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5"></span>
                      {user.employeeStatus || "Active"}
                    </span>
                  </div>
                </div>
              </Card>

            </div>
          )}
          
          {activeTab !== "General Info" && (
            <div className="p-16 text-center border-2 border-dashed border-border rounded-xl bg-muted/10 flex flex-col items-center justify-center">
              <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mb-4">
                <ChevronDown className="w-6 h-6 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-bold text-foreground mb-1">Under Construction</h3>
              <p className="text-sm font-medium text-muted-foreground max-w-sm">The {activeTab} section is currently being updated. Please check back later.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
